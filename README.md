next-draft-rss
==============
#### Android Users
I just bought an Android Nexus 5 phone - no more iPhone. The NextDraft iPhone app is great but there isn't one for Android. Also, the site's RSS/Atom feeds aren't pulling from the articles due to there WP modifications... So I created a NodeJS app to pull the current page and create an RSS file from it - I then hooked it up to https://feedly.com/ to read it offline or whenever. The inital version is working (tested round trip)

#### TODO:
* Cache files on S3
* Not pull on Sat/Sun or Holidays
* Get permission
