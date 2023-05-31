/// <reference types="@vertx/core" />
// @ts-check
import { TestSuite } from '@vertx/unit';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';

import { AbstractServiceContext } from '../src/service/AbstractServiceContext';

import { TestService } from './TestService';
import { TestContext } from './TestContext';

const suite = TestSuite.create("ES4X Test: Service");
const	config = require('./test_config.json');

// PGDBMgr
suite.test("Service.Init", async function (context) {

	let async = context.async();

	try
	{
		let	env = AbstractServiceContext.VerifyEnv("local");

		// initialize the context
		let	appContext = new TestContext(vertx, env, false);

		// determine the path to the config folder
		let	configFolder = process.cwd() + "/tests/config/";
		let	modelFolder = process.cwd() + "/tests/";

		// create the service
		let	service = new TestService();

		// init it
		let	ok = await service.init(appContext, env, configFolder, modelFolder, null);

		// -> make sure it's ok!
		context.assertEquals(ok, true);

		// next let's run some tests
		context.assertEquals(appContext.hasCache(), true);

		// now we are going to run some of the tests
		let	testsToDo = ObjUtils.GetValue(config, "tests", []);
		for(let test of testsToDo)
		{
			// get the action parameters
			let	model = ObjUtils.GetValueToString(test, "model");
			let	action = ObjUtils.GetValueToString(test, "action");
			let	filters = ObjUtils.GetValue(test, "filters");
			let	data = ObjUtils.GetValue(test, "data");

			// execute the action
			let	ret = await service.doOnModel(model, action, filters, data);

			// run the tests
			let	tests = ObjUtils.GetValue(test, "tests");
			for(let key in tests)
			{
				let	value = ObjUtils.GetValue(ret, key);

				// same?
				context.assertEquals(tests[key], value);
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