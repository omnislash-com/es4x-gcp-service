/// <reference types="es4x" />
// @ts-check

import { TestService } from './service/TestService';
import { TestContext } from './service/TestContext';

// determine the path to the config folder
let	configFolder = process.cwd() + "/tests/service/config/";
let	modelFolder = process.cwd() + "/tests/service/";	

// create the service
let	service = new TestService();
let	appContext = new TestContext(vertx, "local", false);

// init it
TestService.StartServer(vertx, service, appContext, configFolder, modelFolder);
