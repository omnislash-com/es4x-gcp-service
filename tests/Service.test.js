/// <reference types="@vertx/core" />
// @ts-check
import { TestSuite } from '@vertx/unit';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';

import { AbstractServiceContext } from '../src/service/AbstractServiceContext';

import { TestService } from './TestService';
import { TestContext } from './TestContext';

const suite = TestSuite.create("ES4X Test: Service");


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
		let	ok = await service.init(appContext, env, configFolder, modelFolder);

		// -> make sure it's ok!
		context.assertEquals(ok, true);

		// next let's run some tests
		context.assertEquals(appContext.hasCache(), true);

	}
	catch(e)
	{
		console.trace(e);
	}

	async.complete();
});

suite.run();