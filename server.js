const path = require('path');

// Run the auth service from the workspace root.
process.chdir(path.join(__dirname, 'auth'));
require('./auth/server');
