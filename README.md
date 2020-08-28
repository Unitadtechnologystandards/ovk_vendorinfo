# ovk_vendorinfo
Information about IAB TCF2.0 tech vendors, including used domains of the vendor and which tag/script placeholders can be used to pass TCF2.0 consent data.

You can either download the list directly from the git (you will need a validate account to do so) or by opening the URL -------

Please download and cache the list on your servers, to minimize traffic & costs. 

## Vendor list format
All vendor information are stored JSON format in the file ovk_vendorinfo.json<br><br>
Fields:
- vendorListVersion {number} - the current version of the file. You can use this field to compare it to your locally cached file
- lastUpdated {date}- the last time the list was updated. You can use this field to decide if your locally cached file is out of date
- macrosDefault {array.string} - the standard macros used by the IAB TCF2.0 to pass consent data to tech vendors. This should work for most vendors, but some might use other macros.
- vendors {array.object(VendorObject)} -  a list of known vendors and their respective properties


### VendorObject
```
{
    "id": 1897,
    "name": "Test Vendor, Inc",
    "domains": ["*.vendorDomain.com","cdn.secondVendorDomain.com"],
    "macros": ["%%gdpr%%", "%%gdpr_consent%%"]
}
```
- id {number} - ID of IAB TCF2.0 vendor. Do not change manually
- name {string} - name of tech vendor as used in the IAB TCF2.0 vendor list. Do not change manually
- domains {array.string} - a list of domains used by the vendor to serve ads or provide other services related to ads.
- macros {array.string} optional - a list of placeholder or macros used by the vendor divergent from the IAB TCF 2.0 standard macros.  Only present if the vendor does not follow the TCF standard.


# How to contribute

You can propose changes to the vendor list.
Possible changes include:
- add a new vendor currently not on the IAB TCF2.0 list
- add or change a list of domains, which are associated with a pre-existing vendor
- add or change a list of GDPR macros/placeholders for a pre-existing vendor, which differ from the TCF2.0 standard macros.

 As minimal requirement you need to be familiar how GIT works and understand the usage of branches.

You can propose those changes either by editing the vendor list directly in GitHub or by exporting this repository to your favourite IDE (Integrated Development Environment), for example Visual Code or IntelliJ.


## Process for change propositions
- Check out the repository and select "MASTER" branch
- Create a new branch, name this branch according to this format "[CURRENT_DATE]_[NAME_OF_YOUR_CHOOSING]" to avoid conflict with other branches. You can not use a branch name that already exists. Base your branch on the current version of "MASTER".
- Please read the section "What to change" first.
- Change the ovk_vendorlist.json file.
- Commit your changes to your newly created branch and write a small summary why you changed it, to give other people the chance to understand your reasons. 
- Push your changes to the GitHub Server

Your changes are now saved but are not affecting the vendor list yet. For your changes to take effective, they will need to be reviewed and confirmed by an admin.<br><br>
To start the review, you will need to create a "Pull Request".<br> 
Please follow these steps:
- Create a new "Pull Request", for example through the gitHub UI here: https://github.com/Unitadtechnologystandards/ovk_vendorinfo/pulls
- Click green button "New pull request"
- On the dropdown "base:" make sure "master" is selected
- On the dropdown "compare:" select the branch you just pushed
- Click green button "Create pull request"
- In the following new form, give your Pull Request a name and write a short comment about why you like to propose the changes (was there an error, did you create something new, etc)
- Click green button "Create pull request" again
- You're done

An admin will look through your proposition as soon as possible. If all is well, your changes will be merged to the "MASTER" branch.<br> In some rare cases an admin might ask you to correct errors in your list (maybe a critical comma is missing, etc). 
In this case, please edit your changes as directed and commit and push your corrected version on the same branch as before. The pull request will automatically incorporate your new changes.


