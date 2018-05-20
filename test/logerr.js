function log(s) {
  if (process.env["DEBUG"]) {
    console.log(s);
  }
}

/**
   err(s)
   - if s is null or false, return
   - if s is a string, error out with string as message
   - if s is a boolean, it better be true, else error
 */

function err(s) {
  if (s === undefined || s === null ) { return; }
  if (typeof s === 'string') {
    console.log(s);
    process.exit(1);
  }
  if (typeof s === 'boolean' && ! s) {
    console.log(`false return from test`);
    process.exit(1);
  }
}

module.exports = [ log, err ];
