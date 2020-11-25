module.exports = function (grunt) {
    const util = {
        /**
         * Will handle errors when using grunt.file.readJson, since a nonJson or missing file will result in an exception. If file can not be read, return an empty object.
         * @param path {string}
         * @returns {{}}
         */
        readJson: function (path) {
            let output = {};
            if(grunt.file.exists(path)){
                try {
                    output = grunt.file.readJSON(path);
                } catch (error) {}
            }
            return output;
        },
        /**
         * Will crawl the localPaths.json and try to find the localPathEntry, provided as argument
         * @param localPathEntry {string}
         */
        getDirectory: function(localPathEntry) {
            if(localPaths.hasOwnProperty(localPathEntry)){
                return localPaths[localPathEntry]
            }else{
                console.error('getDirectory could not find your provided path to %o', localPathEntry);
                return ""
            }
        },
        /**
         * Will try to retrieve AWS Credentials from some other directory
         * NEVER EVER, FOR THE LOVE OF ALL THAT IS HOLY, COMMIT CREDENTIAL FILE TO THIS REPOSITORY.
         * OTHERWISE FAIRIES WILL DIE, CUTE PUPPIES SPONTANEOUSLY CATCH FIRE AND ITS ALL ON YOU
         */
        retrieveAwsCredentials: function(){
            return util.readJson(util.getDirectory('awsCredentialPath'))
        }
    };


    // Project configuration.
    //noinspection JSUnusedGlobalSymbols,JSUnresolvedFunction,JSUnresolvedVariable
    const localPaths = util.readJson('localPaths.json');
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        awsCredentials: util.retrieveAwsCredentials(),
        downloadfile: {
            options: {
                dest: 'resources/',
                overwriteEverytime: true
            },
            files: {
                'iabVendorList.json': util.getDirectory('iabVendorListUrl'),
            }
        },
        s3: {
            options: {
                accessKeyId: '<%= awsCredentials.accessKeyId %>',
                secretAccessKey: '<%= awsCredentials.secretAccessKey %>',
                dryRun: false,
                cache: false
            },
            uploadVendorInfo: {
                src: util.getDirectory('ovkVendorListPath'),
                dest: util.getDirectory('ovkVendorListCdnUrl'),
                options: {
                    bucket: util.getDirectory('awsBucketPath'),
                    headers: {
                        CacheControl: 'max-age=900',
                        ContentEncoding: 'gzip'
                    },
                    region: 'eu-central-1',
                    sslEnabled: true,
                    maxRetries: 3,
                    access: 'public-read',
                    gzip: true
                }
            }
        }
    });

    /**
     * will try to parse the IAB List, compare it to the OVK list and add any vendors that are not present in OVK list.
     *
     * Will also update the version of the ovk list and the last update date
     *
     *
     * todo - have a human readable version of the ovk list
     * is this really necessary? Most JSON View tools automatically convert JSON to some human readable form...
     *
     *
     */
    function populateOvkFile() {
        let vendorListPath = util.getDirectory('ovkVendorListPath'),
            ovkVendorInfo = util.readJson(vendorListPath),
            newVendors = parseIabFileForNewVendors(parseOvkFileForVendorIds());

        if(newVendors.length > 0) {
            console.log('%o new vendors found. Updating vendorinfo.json', newVendors.length);
            ovkVendorInfo["vendorListVersion"] = ovkVendorInfo["vendorListVersion"] +1;
            ovkVendorInfo["lastUpdated"] = new Date();
            ovkVendorInfo["vendors"] = ovkVendorInfo["vendors"].concat(newVendors);
            grunt.file.write(vendorListPath, JSON.stringify(ovkVendorInfo).toString());

        }else{
            console.log("No new vendors, all fine");
        }
    }

    /**
     *  will parse ovk list and return a list of currently present vendor ids, to compare against the vendor ids of the iab list
     * @returns {[]} - array of all vendor ids present on OVK list
     */
    function parseOvkFileForVendorIds () {
        let vendorInfo = util.readJson(util.getDirectory('ovkVendorListPath')),
            vendorIds = [];
        vendorInfo["vendors"].forEach(function(currentVendorEntry){
            if(currentVendorEntry.hasOwnProperty("id")){
                vendorIds.push(currentVendorEntry["id"]);
            }
        });
        return vendorIds;
    }

    /**
     * takes the list of vendor ids from OVK list and iterate through a freshly downloaded version of the iab list.
     * If a vendor id is found, that is not present on the ovk list, build a new entry for OVK and return it
     * @param ovkVendorIds {Array<Number>}
     * @returns {[]}
     */
    function parseIabFileForNewVendors (ovkVendorIds) {

        let iabInfo = util.readJson(util.getDirectory('iabVendorListPath')),
            newVendorEntry = {},
            newVendors = [];
        for (let vendorEntry in iabInfo["vendors"]){
            if(iabInfo["vendors"].hasOwnProperty(vendorEntry)) {
                let currentVendor = iabInfo["vendors"][vendorEntry];
                if(ovkVendorIds.findIndex(function(currentOvkVendorId){
                    return currentOvkVendorId === currentVendor["id"];
                }) === -1){
                    newVendorEntry = {
                        "id": currentVendor["id"],
                        "name": currentVendor["name"],
                        "domains": []
                    };
                    newVendors.push(newVendorEntry)
                }
            }
        }
        return newVendors
    }


    grunt.registerTask('Match IAB List', 'Tries to parse the IAB List for current vendor information', function () {
        grunt.loadNpmTasks('grunt-downloadfile');
        grunt.registerTask('populateOvkList', 'Will try to parse the IAB Vendor list and add all newly found vendors to the OVK list', populateOvkFile);
        grunt.task.run(['downloadfile','populateOvkList']);
    });

    if(typeof grunt.config.get('awsCredentials') === 'object' && Object.keys(grunt.config.get('awsCredentials')).length > 0){
        //only show if all perquisites for CDN upload are met
        grunt.registerTask('Upload to CDN', 'Will take the vendorinfo.json file and upload it to a CDN', function () {
            grunt.loadNpmTasks('grunt-aws');
            grunt.registerTask('populateOvkList', 'Will try to parse the IAB Vendor list and add all newly found vendors to the OVK list', populateOvkFile);
            grunt.task.run(['s3:uploadVendorInfo']);
        });
    }
};