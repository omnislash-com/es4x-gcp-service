
# Introduction
This library offers a SDK for PostgreSQL for the [ES4X Runtime](https://github.com/reactiverse/es4x).

It helps you build queries and run them.

# Usage
## Add dependency
For now just add the Github url to your dependencies in the **package.json** file:
```
"dependencies": {
	"@vertx/core": "4.1.0",
	"es4x-sdk-pgsql": "git+https://github.com/omnislash-com/es4x-sdk-pgsql.git#main"
}
```

## Import the CacheManager class to your code
Import the classes directly from the package like this:
```
import { PGDBMgr } from 'es4x-sdk-pgsql/src/PGDBMgr';
import { PGDBQuery } from 'es4x-sdk-pgsql/src/PGDBQuery';
```

## Create the database connection
You only need to create one instance of the database manager. You do so by doing the following:
```
let	host = "127.0.0.1";
let	user = "login";
let	password = "password";
let	db = "database";
let	port = 5432;
let	dbMgr = await PGDBMgr.Create(vertx, host, user, password, db, port);
```

## Select a row
To run a query to select one row, doing the following:
```
let	tables = [
	"tablename"
];
let	fields = [
	"column1",
	"column2"
];
let	conditions = [
	"column=$value"
];
let	row = await dbMgr.queryFromConditionsToRow(tables, conditions, fields);
if (row != null)
{
	console.log(row["column1"]);
}
```

# Testing
In order to run the tests you need to copy the file:
```
tests/test_config_example.json
```
To
```
tests/test_config.json
```
Then fill is with your database information information and test data.
