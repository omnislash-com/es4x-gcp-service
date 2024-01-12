import { BodyHandler, Router, CorsHandler } from '@vertx/web';
import { HttpMethod } from '@vertx/core/options';

import { AbstractModel } from '../model/AbstractModel';
import { ModelMgr } from '../model/ModelMgr';

import { LogUtils } from 'es4x-utils/src/utils/LogUtils';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { DateUtils } from 'es4x-utils/src/utils/DateUtils';
import { StringUtils } from 'es4x-utils/src/utils/StringUtils';
import { QueryUtils } from 'es4x-utils/src/network/QueryUtils';

class	AbstractService
{
	constructor()
	{
		this.__context = null;
		this.__authInfo = null;
		this.__subscribers = {};

		this.__code = "";
		this.__modelMgr = null;
	}

	getVertx()
	{
		if (this.__context != null)
			return this.__context.getVertx();
		else
			return null;
	}

	static	async	StartServer(_vertx, _service, _appContext, _configFolder, _modelFolder, _isAPI = false)
	{
		_service.log("Starting service...");
	
		// create the VERTX router
		const	mainRouter = Router.router(_vertx);

		// API? we open everything with CORS
		if (_isAPI == true)
		{
			mainRouter.route().handler(CorsHandler.create("*")
			.allowedMethod(HttpMethod.GET)
			.allowedMethod(HttpMethod.POST)
			.allowedMethod(HttpMethod.OPTIONS)
			.allowedMethod(HttpMethod.DELETE)
			.allowedMethod(HttpMethod.PATCH)
			.allowedMethod(HttpMethod.PUT)
			.allowedHeader("Content-Type")
			.allowedHeader("Authorization")
			.allowedHeader("Access-Control-Allow-Origin")
			.allowedHeader("Cache-Control")
			.allowedHeader("Access-Control-Allow-Credentials")
			.allowedHeader("Access-Control-Request-Method")
			.allowedHeader("Access-Control-Allow-Headers")
			.allowCredentials(true));
		}

		// make sure we accept the body
		mainRouter.route().handler(BodyHandler.create());

		// init
		let	ok = await _service.init(_appContext, _configFolder, _modelFolder, mainRouter, _isAPI);
		if (ok == false)
		{
			_service.log('Error launching service: ' + _service.getServiceCode());
		}
		else
		{
			let port = 8080;
			_service.log("Launching server on port: " + port);
			
			// launch the server
			_vertx.createHttpServer()
				.requestHandler(mainRouter)
				.listen(port);
			
			_service.log("SERVICE '" + _service.getServiceCode() + "' is now listening at: http://localhost:" + port + "/");	
		}
	}

	async	init(_appContext, _configFolder, _modelFolder, _router, _isAPI = false)
	{
		// read the configuration
		try
		{
			// load the SERVICE config: code and models
			this.log("Loading service...");
			let	serviceOk = this.loadConfigService(_configFolder, _modelFolder);
			if (serviceOk == false)
			{
				this.logError("Error loading the SERVICE configuration. Verify the file service.js!");
				return false;
			}

			// load the context
			this.log("Loading context with env=" + _appContext.getEnv() + "...");
			let	contextOk = await this.loadContext(_appContext, _configFolder);
			if (contextOk == false)
			{
				this.logError("Error loading the CONTEXT. Verify the file config.js!");
				return false;
			}

			// load the endpoints
			this.log("Loading endpoints...");
			let	endpointsOk = this.loadEndpoints(_configFolder, _router, _isAPI);
			if (endpointsOk == false)
			{
				this.logError("Error configuring the ENDPOINTS. Verify the file endpoints.js!");
				return false;
			}

			return true;
		}
		catch(e)
		{
			console.trace(e);
			return false;
		}
	}

	loadEndpoints(_configFolder, _router, _isAPI = false)
	{
		// no router?
		if (_router == null)
		{
			this.logWarning("No router set to configure the endpoints!");
			return true;
		}

		// read the configuration file with all the endpoints
		try
		{
			let	endpointConfig = require(_configFolder + "endpoints.js");

			// set it up
			let	ret = this.configureEndpoints(endpointConfig, _router, _isAPI);

			// no endpoint configured?
			if ( (ret.forward == 0) && (ret.internal == 0) )
			{
				this.logWarning("No endpoint configured!");
			}
			else
			{
				this.log("We configured " + ret.internal + " internal endpoint(s) and " + ret.forward + " forwarding endpoint(s).");
			}

			return true;
		}
		catch(e)
		{
			console.trace(e);
			return false;
		}
	}

	loadConfigService(_configFolder, _modelFolder)
	{
		// load the config
		let	serviceConfig = require(_configFolder + "service.js");

		// save the service code
		this.__code = ObjUtils.GetValueToString(serviceConfig, "service");
		if (StringUtils.IsEmpty(this.__code) == true)
		{
			this.logError("Error loading the COMMON configuration: the service code is empty!");
			return false;
		}

		// create all the models
		let	modelsConfig = ObjUtils.GetValue(serviceConfig, "models", []);
		let	modelsOk = this.createModelMgr(modelsConfig, _modelFolder);
		if (modelsOk == false)
		{
			this.logError("Error loading the COMMON configuration: we didn't find any model to add!");
			return false;
		}

		// all good
		return true;
	}

	async	loadContext(_appContext, _configFolder)
	{
		// save the context
		this.__context = _appContext;

		// load the configuration
		let	contextConfig = require(_configFolder + "config.js");

		// init the context
		let	contextOk = await this.__context.init(this, contextConfig);

		return contextOk;
	}

	createModelMgr(_modelsConfig, _modelFolder)
	{
		// create the model manager
		this.__modelMgr = new ModelMgr(this);

		// init all the models
		this.__modelMgr.createAllModels(_modelsConfig, _modelFolder);
	}

	getDBMgr(_connectionKey = "default")
	{
		return this.getContext().getPGDBMgr(_connectionKey);
	}

	getServiceCode()
	{
		return this.__code;
	}

	createLog(_payload = null, _model = "")
	{
		// build a new log object
		return {
			service: this.getServiceCode(),
			model: _model,
			data: _payload
		};
	}

	createLogMessage(_message, _model = "")
	{
		let	newMessage = "";

		// add the service and model
		let	serviceCode = this.getServiceCode();
		if (StringUtils.IsEmpty(serviceCode) == false)
		{
			newMessage += "[" + this.getServiceCode();
			if (StringUtils.IsEmpty(_model) == false)
				newMessage += "." + _model;
			newMessage += "] ";
		}

		// add the message
		newMessage += _message;

		return newMessage;
	}

	log(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		LogUtils.Log(finalMessage, data);
	}

	logWarning(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		LogUtils.LogWarning(finalMessage, data);
	}

	logError(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		LogUtils.LogError(finalMessage, data);
	}

	logException(_e)
	{
		LogUtils.LogException(_e);
	}

	async	cache_del(_category, _key)
	{
		return await this.getContext().cache_del(_category, _key);
	}

	async	cache_set(_category, _key, _val, _expirationSec = 0)
	{
		return await this.getContext().cache_set(_category, _key, _val, _expirationSec);
	}

	async	cache_get(_category, _key, _default = null)
	{
		return await this.getContext().cache_get(_category, _key, _default);
	}

	async	cache_setMulti(_category, _keyValues, _expirationSec = 0)
	{
		return await this.getContext().cache_setMulti(_category, _keyValues, _expirationSec);
	}

	async	cache_getMulti(_category, _keys)
	{
		return await this.getContext().cache_getMulti(_category, _keys);
	}

	getConfig(_key, _default = null)
	{
		return this.getContext().getConfig(_key, _default);
	}

	getContext()
	{
		return this.__context;
	}

	getGoogleApi()
	{
		return this.getContext().getGoogleApi();
	}

	async	isVisitorAuthorized(_ctx, _requirements)
	{
		return true;
	}

	async	validateAuth(_ctx, _requirements)
	{
		try
		{
			// check the authorization
			let	authOk = await this.isVisitorAuthorized(_ctx, _requirements);

			// if the auth so not OK, we exit with FORBIDDEN
			if (authOk == false)
			{
				this.logError("Forbidden: authToken not verified", this.__authInfo);

				_ctx.fail(401);

				return false;
			}
			// otherwise we return the auth info
			else
				return true;
		}
		catch(e)
		{
			this.logException(e);

			// output response error
			_ctx.fail(500);			

			return false;
		}
	}

	getAuthUserId()
	{
		return 0;
	}

	isAdmin(_filters)
	{
		return this.getContext().filtersCo_query_queryntainAdminKey(_filters);
	}

	async	do(_query, _model, _action)
	{
		// get the params and the post data
		let	allFilters = _query.getPathAndQueryParams();
		let	data = _query.postParams();

		// execute
		return await this.doOnModel(_model, _action, allFilters, data, null, _query);
	}

	async	doOnModel(_model, _action, _filters, _data = null, _callbackData = null, _query = null)
	{
		// find the model
		let	model = this.__modelMgr.getModel(_model);
		if (model == null)
		{
			this.log("Cannot find model: " + _model);
			return null;
		}

		// execute the action
		return await model.do(_action, _filters, _data, _callbackData, _query);
	}

	configureEndpoints(_endpoints, _router, _isAPI = false)
	{
		// configure endpoint to receive pub sub messages
		_router.post("/pubsub").handler(async ctx => {
			await this.executeEndpointPubSub(ctx);
		});

		// configure endpoint to perform a task
		_router.post("/task/process").handler(async ctx => {
			await this.executeEndpointTaskProcess(ctx);
		});

		// configure endpoint to perform a task callback
		_router.post("/task/callback").handler(async ctx => {
			await this.executeEndpointTaskCallback(ctx);
		});

		// go through all the services
		let	countForward = 0;
		let	countInternal = 0;
		for(const service in _endpoints)
		{
			// are we this service?
			let	serviceActive = service == this.getServiceCode();

			// go through all the models
			for(const model in _endpoints[service].models)
			{
				// go through all the endpoints
				for(const path in _endpoints[service].models[model].endpoints)
				{
					let	actions = _endpoints[service].models[model].endpoints[path];

					// for each action
					for(let j=0; j<actions.length; j++)
					{
						// get the action
						let	action = actions[j].action;
						let	authRequirements = ObjUtils.GetValue(actions[j], "auth", null);
						let	httpMethodOverride = ObjUtils.GetValue(actions[j], "http_method", "").toLowerCase();
						let	postProcessing = _isAPI ? ObjUtils.GetValue(actions[j], "post_processing", null) : null;
						let	preProcessing = ObjUtils.GetValue(actions[j], "pre_processing", null);
						let	cachePostProcessing = _isAPI ? ObjUtils.GetValue(actions[j], "cache_post_processing", []) : [];
						let	actionParams = ObjUtils.GetValue(actions[j], "action_params", null);
					
						// LIST? READ? => GET
						if ( (action == AbstractModel.ACTION_LIST) || (action == AbstractModel.ACTION_READ) || (httpMethodOverride == QueryUtils.HTTP_METHOD_GET) )
						{
							// active? we execute it
							if (serviceActive == true)
							{
								countInternal++;
								console.log({postProcessing});
								_router.get(path).handler(async ctx => {
									console.log({postProcessing});
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements, postProcessing, cachePostProcessing);
								});
							}
							// forward
							else
							{
								countForward++;
								_router.get(path).handler(async ctx => {
									await this.processForwarding(ctx, service, authRequirements, postProcessing, preProcessing, cachePostProcessing);
								});
							}
						}
						// CREATE? LIST BATCH? => POST
						else if ( (action == AbstractModel.ACTION_CREATE) || (action == AbstractModel.ACTION_LIST_BATCH) || (httpMethodOverride == QueryUtils.HTTP_METHOD_POST) )
						{
							// active? we execute it
							if (serviceActive == true)
							{
								countInternal++;
								_router.post(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements, postProcessing, cachePostProcessing);
								});
							}
							// forward
							else
							{
								countForward++;
								_router.post(path).handler(async ctx => {
									await this.processForwarding(ctx, service, authRequirements, postProcessing, preProcessing, cachePostProcessing);
								});
							}
						}
						// UPDATE? => PUT
						else if ( (action == AbstractModel.ACTION_UPDATE) || (httpMethodOverride == QueryUtils.HTTP_METHOD_PUT) )
						{
							// active? we execute it
							if (serviceActive == true)
							{
								countInternal++;
								_router.put(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements, postProcessing, cachePostProcessing);
								});
							}
							// forward
							else
							{
								countForward++;
								_router.put(path).handler(async ctx => {
									await this.processForwarding(ctx, service, authRequirements, postProcessing, preProcessing, cachePostProcessing);
								});
							}
						}
						// DELETE? => DELETE
						else if ( (action == AbstractModel.ACTION_DELETE) || (httpMethodOverride == QueryUtils.HTTP_METHOD_DEL) )
						{
							// active? we execute it
							if (serviceActive == true)
							{
								countInternal++;
								_router.delete(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements, postProcessing, cachePostProcessing);
								});
							}
							// forward
							else
							{
								countForward++;
								_router.delete(path).handler(async ctx => {
									await this.processForwarding(ctx, service, authRequirements, postProcessing, preProcessing, cachePostProcessing);
								});
							}
						}
					}
				}
			}
		}

		return {
			internal: countInternal,
			forward: countForward
		};
	}

	async	processForwarding(_ctx, _service, _authRequirements, _postProcessing, _preProcessing, _cachePostProcessing)
	{
		// verify access
		let	authOk = await this.validateAuth(_ctx, _authRequirements);
		if (authOk)
		{
			let authUserId = this.getAuthUserId();

			await this.getContext().forwardQueryToService(_service, _ctx, null, _postProcessing, authUserId, _preProcessing, _cachePostProcessing);
		}
	}

	async	executeEndpointTaskProcess(_ctx)
	{
		let	query = QueryUtils.create(_ctx);
		try
		{
			// get the payload
			let	payload = query.postParams();
			this.log("CALL FROM TASK PROCESS:", payload);

			// extract the model, action and parameters
			let	model = ObjUtils.GetValue(payload, "model", "");
			let	action = ObjUtils.GetValue(payload, "action", "");
			let	filters = ObjUtils.GetValue(payload, "filters", {});
			let	data = ObjUtils.GetValue(payload, "data", {});
			let	callbackInfo = ObjUtils.GetValue(payload, "callback", null);

			// execute it
			let	taskResult = await this.doOnModel(model, action, filters, data, callbackInfo);
			this.log("-> Task result", taskResult);

			// do we need to send it to a callback?
			if (callbackInfo != null)
			{
				await this.createTaskCallback(callbackInfo, taskResult);
				query.responseJSON({});
			}
			else
			{
				query.responseJSON(taskResult);
			}
		}
		catch(e)
		{
			this.logException(e);
			query.responseException(e);
		}
	}

	async	createTaskCallback(_callbackInfo, _payload, _delaySec = 0, _priority = 1)
	{
		// get the info to send
		let	service = ObjUtils.GetValue(_callbackInfo, "service", "");
		let	model = ObjUtils.GetValue(_callbackInfo, "model", "");
		let	action = ObjUtils.GetValue(_callbackInfo, "action", "");
		let	filters = ObjUtils.GetValue(_callbackInfo, "filters", {});
		let	data = ObjUtils.GetValue(_callbackInfo, "data", {});

		// add
		data["result"] = _payload;

		// create it
		return await this.createTaskProcess(service, model, action, filters, data, null, _delaySec, _priority)
	}

	async	executeEndpointTaskCallback(_ctx)
	{
		let	query = QueryUtils.create(_ctx);
		try
		{
			// get the payload
			let	payload = query.postParams();
			this.log("CALL FROM TASK CALLBACK:", payload);

			// extract the model, action and parameters
			let	model = ObjUtils.GetValue(payload, "model", "");
			let	action = ObjUtils.GetValue(payload, "action", "");
			let	filters = ObjUtils.GetValue(payload, "filters", {});
			let	data = ObjUtils.GetValue(payload, "data", {});

			// execute it
			let	result = await this.doOnModel(model, action, filters, data);
			this.log("-> result =", result);

			// success
			query.responseJSON({});
		}
		catch(e)
		{
			this.logException(e);
			query.responseException(e);
		}
	}

	async	createTaskProcess(_service, _model, _action, _filters = {}, _data = {}, _callbackInfo = null, _delaySec = 0, _priority = 1)
	{
		// create the task
		return await this.getContext().createTaskProcess(_service, _model, _action, _filters, _data, _callbackInfo, _delaySec, _priority);
	}

	async	executeEndpointPubSub(_ctx)
	{
		let	query = QueryUtils.create(_ctx);
		try
		{
			// get the payload
			let	payload = query.postParams();
			this.log("CALL FROM PUB SUB:", payload);

			// check if it's the payload we're looking for or if it comes from Google
			let	sourceService = ObjUtils.GetValue(payload, "service", null);
			let	payloadJson = null;
			if (StringUtils.IsEmpty(sourceService) == true)
			{
				// extract and validate the data
				this.log("Extracting json data...");
				payloadJson = await this.getContext().getGoogleApi().extractPayloadFromPubSub(payload);
			}
			else
			{
				payloadJson = payload;
			}

			// if we have the data, we send it to our subscribers
			if (payloadJson != null)
			{
				// process the event internally
				this.log("Processing the message:", payloadJson);

				// make sure to not process it if it's coming from us!
				sourceService = ObjUtils.GetValue(payloadJson, "service", null);
				let	forceLocal = ObjUtils.GetValueToBool(payloadJson, "force_local");
				if ( ((sourceService != null) && (sourceService != this.getServiceCode())) || (forceLocal == true) )
				{
					await this.processEventLocally(payloadJson);
				}
				else
				{
					this.log("Event coming from ourselves!");
				}
			}
			else
			{
				this.logError("No message to process!");
			}

			// success
			query.responseJSON({});
		}
		catch(e)
		{
			this.logException(e);
			query.responseException(e);
		}
	}

	async	executeEndpoint(_ctx, _model, _action, _actionParams = null, _authRequirements = null, _postProcessing = null, _cachePostProcessing = [])
	{
		console.log({_model, _action, _actionParams, _authRequirements, _postProcessing, _cachePostProcessing})
		let	query = QueryUtils.create(_ctx);
		try
		{
			// do the action
			let	result = await this.do(query, _model, _action);

			// do post processing actions
			if (result !== null)
			{
				let	filters = query.getPathAndQueryParams();
				let	bodyParams = query.postParams();
				let authUserId = this.getAuthUserId();
				console.log("post processing result");
				console.log(_postProcessing);
				result = await this.getContext().postProcessResult(result, _postProcessing, filters, bodyParams, authUserId);

				// cache post processing
				await this.getContext().cachePostProcessing(_cachePostProcessing, filters, bodyParams, result, authUserId);	
			}

			// response depending on the type of action
			// LIST?
			if (_action == AbstractModel.ACTION_LIST)
			{
				query.responseJSON(result);
			}
			// LIST BATCH?
			else if (_action == AbstractModel.ACTION_LIST_BATCH)
			{
				query.responseJSON(result);
			}
			// CREATE?
			else if (_action == AbstractModel.ACTION_CREATE)
			{
				query.responseSuccessOrError(result);
			}
			// READ?
			else if (_action == AbstractModel.ACTION_READ)
			{
				if (result != null)
					query.responseJSON(result);
				else
					query.responseNotFound();				
			}
			// UPDATE? => PUT
			else if (_action == AbstractModel.ACTION_UPDATE)
			{
				// if we're good
				if (result != null)
				{
					let	returnAll = ObjUtils.GetValueToBool(_actionParams, "return_all", false);
					if (returnAll == true)
						query.responseJSON(result);
					else
						query.responseJSON({});
				}
				else
					query.responseNotFound();				
			}
			// DELETE? => DELETE
			else if (_action == AbstractModel.ACTION_DELETE)
			{
				// if we're good
				if (result == true)
					query.responseJSON({});
				else
					query.responseNotFound();				
			}
			else
			{
				query.responseSuccessOrError(result);
			}
		}
		catch(e)
		{
			this.logException(e);
			query.responseException(e);
		}
	}

	async	pushEvent(_modelCode, _eventType, _payload, _sendRemotely = true)
	{
		// create the event
		let	event = {
			"code": this.createEventCode(_modelCode, _eventType),
			"service": this.getServiceCode(),
			"model": _modelCode,
			"type": _eventType,
			"created_at": DateUtils.NowToString(),
			"payload": _payload
		};

		// process the event internally
		await this.processEventLocally(event);

		// send to pub / sub
		if (_sendRemotely == true)
			await this.processEventRemotely(event);
	}

	getSubscribersForEvent(_eventCode)
	{
		if (ObjUtils.HasProperty(this.__subscribers, _eventCode) == true)
			return this.__subscribers[_eventCode];
		else
			return [];
	}

	async	processEventLocally(_event)
	{
		if (this.__modelMgr == null)
			return;
			
		// get the subscribers
		let	subscribers = this.getSubscribersForEvent(_event["code"]);

		// send them the event
		for(let i=0; i<subscribers.length; i++)
		{
			// get the model
			let	model = this.__modelMgr.getModel(subscribers[i]);

			// if we have it, we forward the message
			if (model != null)
			{
				await model.onPubSubEvent(_event);
			}
			else
				this.logError("Cant find model: " + subscribers[i]);
		}
	}

	async	processEventRemotely(_event)
	{
		return await this.getContext().processEventRemotely(_event);
	}

	createEventCode(_model, _event, _service = "")
	{
		// empty service?
		if (StringUtils.IsEmpty(_service) == true)
			_service = this.getServiceCode();

		return [_service, _model, _event].join(".");
	}

	addSubscriber(_model, _eventModelCode, _eventType, _eventService = "")
	{
		// create the final code of event
		let	eventId = this.createEventCode(_eventModelCode, _eventType, _eventService);

		// make sure we have a list of subscribers for it
		if (ObjUtils.HasProperty(this.__subscribers, eventId) == false)
			this.__subscribers[eventId] = [];

		// if we don't have that model already we add it
		if (this.__subscribers[eventId].includes(_model) == false)
		{
			this.__subscribers[eventId].push(_model);	
		}
	}	

	async	populateItemsFromInstructions(_items, _instructions)
	{
		return await this.getContext().populateItemsFromInstructions(_items, _instructions, this.getAuthUserId());
	}

	async	populateItems(_items, _type, _fieldId, _fieldTarget, _depthMax = -1)
	{
		return await this.getContext().populateItems(_items, _type, _fieldId, _fieldTarget, this.getAuthUserId(), _depthMax);
	}

	async	getItemInfoBatch(_ids, _type)
	{
		return await this.getContext().getItemInfoBatch(_ids, _type, this.getAuthUserId());
	}

	async	getFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		return await this.getContext().getFromServiceToJson(_service, _path, _queryParams, _port);
	}

	async	postFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		return await this.getContext().postFromServiceToJson(_service, _path, _queryParams, _port);
	}

	async	getFromHostToJson(_host, _path, _queryParams = {}, _port=443, _headers={})
	{
		return await this.getContext().getFromHostToJson(_host, _path, _queryParams, _port, _headers);
	}

	async	doOnModelRemote(_service, _model, _action, _filters, _data)
	{
		return await this.getContext().doOnModelRemote(_service, _model, _action, _filters, _data);
	}
}

module.exports = {
	AbstractService
};