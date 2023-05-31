/// <reference types="@vertx/core" />
// @ts-check
import { TestSuite } from '@vertx/unit';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { WebClientMgr } from 'es4x-utils/src/network/WebClientMgr';


const suite = TestSuite.create("ES4X Test: Service");
const	config = require('./test_config.json');

// Endpoints
suite.test("ServerEndpoints", async function (context) {

	let async = context.async();

	try
	{
		// get the HTTP client
		let	webClient = new WebClientMgr(vertx);
		let	host = "localhost";
		let	port = 8080;
		let	doSSL = false;

		// get the list of tests to do
		let	testsToDo = ObjUtils.GetValue(config, "service_endpoints", []);
		for(let test of testsToDo)
		{
			// get the request parameters
			let	method = ObjUtils.GetValueToString(test, "method");
			let	path = ObjUtils.GetValueToString(test, "path");
			let	body = ObjUtils.GetValue(test, "body");

			// do the request
			let	ret = await webClient.query(method, host, path, body, {}, true, true, port, doSSL);

			// make sure the query is good
			context.assertEquals(ret.statusCode, ObjUtils.GetValueToInt(test, "statusCode"));

			// run the tests
			let	tests = ObjUtils.GetValue(test, "tests");
			for(let key in tests)
			{
				// special key?
				if (key == "**length**")
				{
					context.assertEquals(tests[key], ret.content.length);
				}
				else
				{
					let	value = ObjUtils.GetValue(ret.content, key);

					// same?
					context.assertEquals(tests[key], value);
				}
			}
		}
	}
	catch(e)
	{
		console.trace(e);
	}

	async.complete();
});

suite.run();