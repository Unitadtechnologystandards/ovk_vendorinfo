module.exports = function (grunt) {
    /**
     * utility functions collected in one place. Will grow over time
     *
     * @type {{retrieveAwsCredentials: (function(): {}), getDirectory: getDirectory, readJson: (function(string): {})}}
     */
    const util = {
        /**
         * Will handle errors when using grunt.file.readJson, since a nonJson or missing file will result in an exception. If file can not be read, return an empty object.
         * @param path {string}
         * @returns {{}}
         */
        readJson: function (path) {
            let output = {};
            if (grunt.file.exists(path)) {
                try {
                    output = grunt.file.readJSON(path);
                } catch (error) {
                }
            }
            return output;
        },
        /**
         * Will crawl the localPaths.json and try to find the localPathEntry, provided as argument
         * @param localPathEntry {string}
         */
        getDirectory: function (localPathEntry) {
            if (localPaths.hasOwnProperty(localPathEntry)) {
                return localPaths[localPathEntry]
            } else {
                console.error('getDirectory could not find your provided path to %o', localPathEntry);
                return ""
            }
        },
        /**
         * tries to remove most cases of wrongly entered domain data from an imported csv file
         * file should have 2 columns
         *  1.) containing an iab vendorId
         *  2.) containing one domain entry
         *
         *  Each row marks one domain for one vendor. If you want to add multiple domains, insert a new row with the same vendor id
         *  ex:   id        domain
         *        60        newdomain1.de
         *        60        newdomain2.de
         *
         *  Since most data sources might not follow these rules, we need to make sure that the domains are correctly inserted and parse all entries, trying to rescue the data.
         *
         * Search for obvious patterns in URLs to generate an easy to use domain list.
         * Mark wrongly entered text as "TXT_", so our JSON parser can later decide what to do with
         * @param key {string} - the key name from the imported csv file
         * @param value {string} - the value associated with the key from the imported csv file
         * @returns {string}
         */
        processCsvImportValues: function (key, value) {
            const protocol = /(https:\/\/|http:\/\/)/gi;
            const www = /www/gi;


            let newValue = value;
            newValue = newValue.toLowerCase();
            newValue = newValue.replace(protocol, '');
            newValue = newValue.replace(www, '');
            if (newValue.indexOf('.') === 0) {
                newValue = '*' + newValue
            }
            return newValue;
        },
        /**
         * Will try to retrieve AWS Credentials from some other directory
         * NEVER EVER, FOR THE LOVE OF ALL THAT IS HOLY, COMMIT CREDENTIAL FILE TO THIS REPOSITORY.
         * OTHERWISE FAIRIES WILL DIE, CUTE PUPPIES SPONTANEOUSLY CATCH FIRE AND ITS ALL ON YOU
         */
        retrieveAwsCredentials: function () {
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
        csvjson: {
            options: {
                parserOptions: {
                    auto_parse: true
                },

                processValue: util.processCsvImportValues
            },
            importDomains: {
                src: util.getDirectory('csvDomainImport'),
                dest: 'resources/domainImport',
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
    function populateOvkFileWithNewIabVendors() {
        let vendorListPath = util.getDirectory('ovkVendorListPath'),
            ovkVendorInfo = util.readJson(vendorListPath),
            newVendors = parseIabFileForNewVendors(parseOvkFileForVendorIds());

        if (newVendors.length > 0) {
            console.log('%o new vendors found. Updating vendorinfo.json', newVendors.length);
            ovkVendorInfo["vendors"] = ovkVendorInfo["vendors"].concat(newVendors);
            writeVendorinfoToDisk(ovkVendorInfo)
        } else {
            console.log("No new vendors, all fine");
        }
    }

    /**
     * Writes a given json Object to disk using the localPath "ovkVendorListPath"
     * @param vendorinfo {Object}
     */
    function writeVendorinfoToDisk (vendorinfo){
        const vendorListPath = util.getDirectory('ovkVendorListPath');

        vendorinfo["vendorListVersion"] = vendorinfo["vendorListVersion"] + 1;
        vendorinfo["lastUpdated"] = new Date();
        grunt.file.write(vendorListPath, JSON.stringify(vendorinfo).toString());
    }

    /**
     *  will parse ovk list and return a list of currently present vendor ids, to compare against the vendor ids of the iab list
     * @returns {[]} - array of all vendor ids present on OVK list
     */
    function parseOvkFileForVendorIds() {
        let vendorInfo = util.readJson(util.getDirectory('ovkVendorListPath')),
            vendorIds = [];
        vendorInfo["vendors"].forEach(function (currentVendorEntry) {
            if (currentVendorEntry.hasOwnProperty("id")) {
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
    function parseIabFileForNewVendors(ovkVendorIds) {

        let iabInfo = util.readJson(util.getDirectory('iabVendorListPath')),
            newVendorEntry = {},
            newVendors = [];
        for (let vendorEntry in iabInfo["vendors"]) {
            if (iabInfo["vendors"].hasOwnProperty(vendorEntry)) {
                let currentVendor = iabInfo["vendors"][vendorEntry];
                if (ovkVendorIds.findIndex(function (currentOvkVendorId) {
                    return currentOvkVendorId === currentVendor["id"];
                }) === -1) {
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

    /**
     * Will walk through the vendorinfo.json data and try to map each vendorId to a new domain entry from the parseDomainList method.
     * Should an entry be present, add only the domain entries that are not already present on vendorinfo.json
     * Afterwards write the whole vendorinfo.json to disk (should there be any actual changes)
     */
    function insertDomainsToVendorinfo() {
        let domainJson = parseDomainList(),
            vendorinfoData = util.readJson(util.getDirectory('ovkVendorListPath')),
            vendorData = vendorinfoData['vendors'],
            counter = 0;

        for (let vendorEntry in vendorData){
            if(vendorData.hasOwnProperty(vendorEntry)){
                let currentVendor = vendorData[vendorEntry];

                for (let domainVendorEntry in domainJson){
                    if(domainJson.hasOwnProperty(domainVendorEntry)){
                        let currentDomains = domainJson[domainVendorEntry];


                        if(currentVendor['id'] === parseFloat(domainVendorEntry)){
                            let oldDomainLength = currentVendor['domains'].length;
                            currentVendor['domains'] = filterDuplicateValues(currentVendor['domains'].concat(currentDomains));
                            if(currentVendor['domains'].length > oldDomainLength){
                                counter++;
                            }
                        }
                    }
                }
            }
        }
        if(counter > 0){
            writeVendorinfoToDisk(vendorinfoData);
            console.log('%o domains updated', counter)
        }else{
            console.log('no new domains found, vendorinfo not updated')
        }
    }

    /**
     * will analyse the possible domain data given by the vendor and convert it to an Iab vendor id with an attached array of all known domains. Since the domain data is not entered uniform, each value has to be checked and in some case converted to be machine-readable.
     * Will return a finished list of all iab vendor ids
     *
     * todo make this independent from the column names of a given csv and import wholesale from the "domainImport" subdirectory
     * @returns {{}}
     */
    function parseDomainList() {
        let jsonInput = util.readJson(util.getDirectory('csvDomainOutput')),
            output = {},
            keyName,
            value,
            editedValueArray = [];

        for (let key in jsonInput) {
            if (jsonInput.hasOwnProperty(key)) {
                value = jsonInput[key];
                keyName = key.slice(0, key.indexOf('-ID'));
                if (output.hasOwnProperty(keyName) === false) {
                    output[keyName] = []
                }
                if (Array.isArray(value) === true) {
                    editedValueArray = filterDuplicateValues(value);
                }
                if (typeof value === 'string') {
                    editedValueArray = [value]
                }
                output[keyName] = output[keyName].concat(normalizeValueArray(editedValueArray));
            }
        }
        return output
    }

    /**
     * walk the array of values and send all values to more advanced methods. Since those values might be strings or arrays, those advanced methods must first scrub and normalize the values, before we can return the completed valueArray
     * @param valueArray {Array}
     * @returns {[]}
     */

    function normalizeValueArray(valueArray) {
        let outputArray = [];

        for (let counter = 0; counter < valueArray.length; counter++) {
            let currentString = valueArray[counter];
            outputArray = outputArray.concat(normalizeValueString(currentString))
        }
        return outputArray
    }

    /**
     * Will analyse the given "string" and determines if it actually includes data that might be suited for converting to arrays (ex: vendor has given multiple domains delimited by comma).
     * scrubs potentially wrong entries and will mark any values it might not handle, for later filtering
     * Afterwards returns a "cleaned" array with an own entry for each possible vendor domain
     * @param currentString {string}
     * @returns {[*]}
     */
    function normalizeValueString(currentString) {
        const linefeed = String(grunt.util.linefeed),
            delimiter = new RegExp('([,;' + linefeed + '])', 'gi'),
            whitespace = /\s/g,
            stringIsArray = ((currentString.match(delimiter) || []).length >= 1);

        let outputAsArray;


        if (stringIsArray) {
            outputAsArray = convertStringWithDelimitersToArray(currentString)
        } else {
            outputAsArray = [currentString]
        }
        outputAsArray.forEach(function(currentElement, index,wholeArray){

            if ((currentElement.match(whitespace) || []).length >= 3) {
                currentElement = 'TXT_' + currentElement
            }
            currentElement = currentElement.replace(whitespace, '');
            currentElement = filterUrlUnsafeCharacters(currentElement);
            wholeArray[index] = currentElement;
        });
        return outputAsArray
    }

    /**
     * will search for , ; or linebreak to convert the given string in "sub"strings and return an array
     * @param currentString {string}
     * @returns {Array}
     */
    function convertStringWithDelimitersToArray(currentString) {
        const linefeed = String(grunt.util.linefeed);
        let output;
        if (currentString.indexOf(linefeed) > -1) {
            output = currentString.split(linefeed)
        }
        if (currentString.indexOf(',') > -1 && currentString.indexOf(';') === -1) {
            output = currentString.split(',')
        }
        if (currentString.indexOf(';') > -1 && currentString.indexOf(',') === -1) {
            output = currentString.split(';')
        }
        if (currentString.indexOf(';') > -1 && currentString.indexOf(',') > -1) {
            console.error('error in converting string to array, no single delimiter can be found: %o', currentString);
            output = [currentString]
        }
        return output
    }

    /**
     * will look for URL unsafe characters and mark the string as potentially wrong. Later methods will search for this marker and decide what to do.
     * @param currentString {string}
     * @returns {string}
     */
    function filterUrlUnsafeCharacters(currentString) {
        const unSafeCharacters = /([<>\[\]}#%|^~'$&+:;=?@\s])/gi;

        if ((currentString.match(unSafeCharacters) || []).length > 0) {
            currentString = 'WARN_' + currentString
        }
        return currentString;
    }


    /**
     * Will search the array for duplicate entries and only allow the first entry to remain
     * @param valueArray {Array}
     * @returns {[]}
     */
    function filterDuplicateValues(valueArray) {
        let newValueArray = [];

        for (let subValue in valueArray) {
            if (valueArray.hasOwnProperty(subValue)) {
                let currentValue = valueArray[subValue];
                if (newValueArray.indexOf(currentValue) === -1) {
                    newValueArray.push(currentValue)
                }
            }
        }
        return newValueArray
    }

    grunt.registerTask('Match IAB List', 'Tries to parse the IAB List for current vendor information', function () {
        grunt.loadNpmTasks('grunt-downloadfile');
        grunt.registerTask('populateOvkList', 'Will try to parse the IAB Vendor list and add all newly found vendors to the OVK list', populateOvkFileWithNewIabVendors);
        grunt.task.run(['downloadfile', 'populateOvkList']);
    });

    grunt.registerTask('Populate with domains', 'Tries to parse the IAB List for current vendor information', function () {
        grunt.loadNpmTasks('grunt-csv-json');
        grunt.registerTask('insertDomains', 'parse  output of csv import and try to link IAB Vendors to their domain entries.', insertDomainsToVendorinfo);
        grunt.task.run(['csvjson', 'insertDomains']);
    });


    if (typeof grunt.config.get('awsCredentials') === 'object' && Object.keys(grunt.config.get('awsCredentials')).length > 0) {
        //only show if all perquisites for CDN upload are met
        grunt.registerTask('Upload to CDN', 'Will take the vendorinfo.json file and upload it to a CDN', function () {
            grunt.loadNpmTasks('grunt-aws');
            grunt.registerTask('populateOvkList', 'Will try to parse the IAB Vendor list and add all newly found vendors to the OVK list', insertDomainsToVendorinfo);
            grunt.task.run(['s3:uploadVendorInfo']);
        });
    }
};