[![Build Status](https://travis-ci.org/simpleviewinc/mongolayer.svg?branch=master)](https://travis-ci.org/simpleviewinc/mongolayer)

# mongolayer

MongoDB model layer with validation and hooks, similar to Mongoose but thinner.

Documentation coming in the next few weeks.

Known Flaws with Mongoose

0. If a record in the DB does not a value in a field, it will still be fill it with the default value when you pull it out of the database.
0. Unable to populate recursive records (populate in a populate).
0. Unable to run post-find hooks with async code that gets flow control.
0. Too many differences to the way that node-mongodb-native functions out of the box.
0. Update method doesn't run hooks, validation, and automatically attaches $set modifier. What if you want to use an actual replace?
0. Save() method not implemented with mongoose unless using the new doc() syntax.