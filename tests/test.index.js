/// <reference types="es4x" />
// @ts-check
import { Router } from '@vertx/web';

import { TestService } from './TestService';
import { TestContext } from './TestContext';
import { AbstractServiceContext } from '../src/service/AbstractServiceContext';

// create the service
let	service = new TestService();

// init it
startServer(vertx, service);


async	function	startServer(_vertx, _service)
{
	_service.log("Starting service...");
	let	env = AbstractServiceContext.VerifyEnv("local");

	// initialize the context
	let	appContext = new TestContext(_vertx, env, false);
	
	// determine the path to the config folder
	let	configFolder = process.cwd() + "/tests/config/";
	let	modelFolder = process.cwd() + "/tests/";	

	// init
	let	ok = await _service.init(appContext, env, configFolder, modelFolder);
	if (ok == false)
	{
		_service.log('Error launching service: ' + _service.getServiceCode());
	}
	else
	{
		let port = 8080;
		_service.log("Launching server on port: " + port);
		
		// create the VERTX router
		const	mainRouter = Router.router(vertx);

		// launch the server
		_vertx.createHttpServer()
			.requestHandler(mainRouter)
			.listen(port);
		
		_service.log("SERVICE '" + _service.getServiceCode() + "' is now listening at: http://localhost:" + port + "/");	
	}
}

