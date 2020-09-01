module.exports = function (grunt) {

    const options = {
        iabVendorListUrl: "https://vendorlist.consensu.org/v2/vendor-list.json",
        iabVendorListPath: "resources/iabVendorList.json",
        ovkVendorListPath: "ovk_vendorinfo.json"
    };


    // Project configuration.
    //noinspection JSUnusedGlobalSymbols,JSUnresolvedFunction,JSUnresolvedVariable
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        downloadfile: {
            options: {
                dest: 'resources/',
                overwriteEverytime: false
            },
            files: {
                'iabVendorList.json': options.iabVendorListUrl,
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
     * todo - compare human readable version with minified ovk list, if changes are found, merge them and update list
     *
     */
    function populateOvkFile() {
        let ovkVendorInfo = grunt.file.readJSON(options.ovkVendorListPath),
            newVendors = parseIabFileForNewVendors(parseOvkFileForVendorIds());

        console.log(ovkVendorInfo);
        if(newVendors.length > 0) {
            ovkVendorInfo["vendorListVersion"] = ovkVendorInfo["vendorListVersion"] +1;
            ovkVendorInfo["lastUpdated"] = "2020-08-20T11:00:08Z";
            ovkVendorInfo["vendors"] = ovkVendorInfo["vendors"].concat(newVendors);
            grunt.file.write(options.ovkVendorListPath, JSON.stringify(ovkVendorInfo).toString());
        }
        console.log("No new vendors, all fine");
    }

    /**
     *  will parse ovk list and return a list of currently present vendor ids, to compare against the vendor ids of the iab list
     * @returns {[]} - array of all vendor ids present on OVK list
     */
    function parseOvkFileForVendorIds () {
        let vendorinfo = grunt.file.readJSON(options.ovkVendorListPath),
            vendorIds = [];
        vendorinfo["vendors"].forEach(function(currentVendorEntry){
            if(currentVendorEntry.hasOwnProperty("id")){
                vendorIds.push(currentVendorEntry["id"]);
            }
        });
        return vendorIds;
    }

    /**
     * takes the list of vendor ids from OVK list and iterate through a freshly downloaded version of the iab list.
     * If a vendor id is found, that is not present on the ovk list, build a new entry for OVK and return it
     * @param ovkVendorIds {Array.Number}
     * @returns {[]}
     */
    function parseIabFileForNewVendors (ovkVendorIds) {

        let iabInfo = grunt.file.readJSON(options.iabVendorListPath),
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


    grunt.registerTask('Start IabMatching', 'Tries to parse the IAB List for current vendor information', function () {
        grunt.loadNpmTasks('grunt-downloadfile');
        grunt.registerTask('populateOvkList', 'Will try to parse the IAB Vendor list and add all newly found vendors to the OVK list', populateOvkFile);
        grunt.task.run(['downloadfile','populateOvkList']);
    });


};