import { AppContext } from '../app/AppContext';
import { AbstractModel } from '../model/AbstractModel';
import { QueryUtils } from '../app/QueryUtils';
import { ObjUtils } from '../utils/ObjUtils';
import { DateUtils } from '../utils/DateUtils';
import { StringUtils } from '../utils/StringUtils';

class	AppService
{
	/**
	 * @param {AppContext} _appContext
	*/	
	constructor(_appContext)
	{
		this.__appContext = _appContext;
		this.__authInfo = null;
		this.__subscribers = {};

		// set the main service to the context
		this.__appContext.setMainService(this);

		// create the models
		this.createModels();
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
		let	newMessage = "[" + this.getServiceCode();
		if (StringUtils.IsEmpty(_model) == false)
			newMessage += "." + _model;
		newMessage += "] " + _message;
		return newMessage;
	}

	log(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		ObjUtils.Log(finalMessage, data);
	}

	logWarning(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		ObjUtils.LogWarning(finalMessage, data);
	}

	logError(_message, _payload = null, _model = "")
	{
		let	finalMessage = this.createLogMessage(_message, _model);
		let	data = this.createLog(_payload, _model);
		ObjUtils.LogError(finalMessage, data);
	}

	logException(_e)
	{
		ObjUtils.LogException(_e);
	}

	async	cache_del(_category, _key)
	{
		return await this.__appContext.cache_del(_category, _key);
	}

	async	cache_set(_category, _key, _val, _expirationSec = 0)
	{
		return await this.__appContext.cache_set(_category, _key, _val, _expirationSec);
	}

	async	cache_get(_category, _key, _default = null)
	{
		return await this.__appContext.cache_get(_category, _key, _default);
	}

	async	cache_setMulti(_category, _keyValues, _expirationSec = 0)
	{
		return await this.__appContext.cache_setMulti(_category, _keyValues, _expirationSec);
	}

	async	cache_getMulti(_category, _keys)
	{
		return await this.__appContext.cache_getMulti(_category, _keys);
	}

	createModels()
	{
		// create the model mgr
		this.__modelMgr = this.createModelMgr();

		// let's create all the models if we can
		if (this.__modelMgr != null)
			this.__modelMgr.createAllModels();
	}

	getConfig(_key, _default = null)
	{
		return this.__appContext.getConfig(_key, _default);
	}

	getAppContext()
	{
		return this.__appContext;
	}

	getServiceCode()
	{
		throw new Error("Abstract Method has no implementation");
	}

	createModelMgr()
	{
		return null;
	}

	getDBMgr()
	{
		return null;
	}

	getGoogleApi()
	{
		return this.__appContext.getGoogleApi();
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
		return this.__appContext.filtersContainAdminKey(_filters);
	}

	async	do(_query, _model, _action)
	{
		// get the params and the post data
		let	allFilters = _query.getPathAndQueryParams();
		let	data = _query.postParams();

		// execute
		return await this.doOnModel(_model, _action, allFilters, data);
	}

	async	doOnModel(_model, _action, _filters, _data = null, _callbackData = null)
	{
		// find the model
		let	model = this.__modelMgr.getModel(_model);
		if (model == null)
		{
			this.log("Cannot find model: " + _model);
			return null;
		}

		// execute the action
		return await model.do(_action, _filters, _data, _callbackData);
	}

	configureEndpoints(_endpoints, _router)
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
						let	postProcessing = ObjUtils.GetValue(actions[j], "post_processing", null);
						let	preProcessing = ObjUtils.GetValue(actions[j], "pre_processing", null);
						let	cachePostProcessing = ObjUtils.GetValue(actions[j], "cache_post_processing", []);
						let	actionParams = ObjUtils.GetValue(actions[j], "action_params", null);
					
						// LIST? READ? => GET
						if ( (action == AbstractModel.ACTION_LIST) || (action == AbstractModel.ACTION_READ) || (httpMethodOverride == QueryUtils.HTTP_METHOD_GET) )
						{
							// active? we execute it
							if (serviceActive == true)
							{
								_router.get(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements);
								});
							}
							// forward
							else
							{
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
								_router.post(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements);
								});
							}
							// forward
							else
							{
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
								_router.put(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements);
								});
							}
							// forward
							else
							{
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
								_router.delete(path).handler(async ctx => {
									await this.executeEndpoint(ctx, model, action, actionParams, authRequirements);
								});
							}
							// forward
							else
							{
								_router.delete(path).handler(async ctx => {
									await this.processForwarding(ctx, service, authRequirements, postProcessing, preProcessing, cachePostProcessing);
								});
							}
						}
					}
				}
			}
		}		
	}

	async	processForwarding(_ctx, _service, _authRequirements, _postProcessing, _preProcessing, _cachePostProcessing)
	{
		// verify access
		let	authOk = await this.validateAuth(_ctx, _authRequirements);
		if (authOk)
		{
			let authUserId = this.getAuthUserId();

			await this.__appContext.forwardQueryToService(_service, _ctx, null, _postProcessing, authUserId, _preProcessing, _cachePostProcessing);
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
		return await this.getAppContext().createTaskProcess(_service, _model, _action, _filters, _data, _callbackInfo, _delaySec, _priority);
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
				payloadJson = await this.__appContext.getGoogleApi().extractPayloadFromPubSub(payload);
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

	async	executeEndpoint(_ctx, _model, _action, _actionParams = null, _authRequirements = null)
	{
		let	query = QueryUtils.create(_ctx);
		try
		{
			// do the action
			let	result = await this.do(query, _model, _action);

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

	async	processEventLocally(_event)
	{
		if (this.__modelMgr == null)
			return;
			
		// get the subscribers
		let	subscribers = [];

		// is it an USER DELETE REQUEST CREATED, REACTIVATED or DELETED? we get all the models
		if (AbstractModel.PUBSUB_EVENT_USER_ACTION_LIST.includes(_event["code"]) == true)
		{
			subscribers = this.__modelMgr.getAllModelCodes();
		}
		// we get only the subscribers
		else
		{
			if (ObjUtils.HasProperty(this.__subscribers, _event["code"]) == true)
				subscribers = this.__subscribers[_event["code"]];
		}

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
		// we are now creating a TASK on the task processor to publish the event and forward it to the listeners
		let	queue = "task-processor-events";
		let	payload = {
			"model": "taskprocessor_event",
			"action": "publish_event",
			"data": _event
		};

		this.log("Publishing event to pub sub (NEW TASK PROCESSOR)...", payload);
		let	ret = await this.getAppContext().createGoogleTask(AppContext.SERVICE_TASK_PROCESSOR, "/task/process", payload, 0, queue);
		this.log("PubSub publish result: " + ret);

		// publish the event to PUB SUB
//		this.log("Publishing event to pub sub...", _event);
//		let	statusCode = await this.__appContext.getGoogleApi().pubSub_publishMessage(this.getServiceCode(), _event);
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
		return await this.__appContext.populateItemsFromInstructions(_items, _instructions, this.getAuthUserId());
	}

	async	populateItems(_items, _type, _fieldId, _fieldTarget, _depthMax = -1)
	{
		return await this.__appContext.populateItems(_items, _type, _fieldId, _fieldTarget, this.getAuthUserId(), _depthMax);
	}

	async	getItemInfoBatch(_ids, _type)
	{
		return await this.__appContext.getItemInfoBatch(_ids, _type, this.getAuthUserId());
	}

	async	getFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		return await this.__appContext.getFromServiceToJson(_service, _path, _queryParams, _port);
	}

	async	postFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		return await this.__appContext.postFromServiceToJson(_service, _path, _queryParams, _port);
	}

	async	callFunctionFromOmniSetData(_function, _params)
	{
		let	host = this.getConfig("omnislash.gamedata.host", "");
		let	path = this.getConfig("omnislash.gamedata.paths." + _function, "");

		if (ObjUtils.IsObject(_params) == false)
			_params = {};

		// add the key
		_params["key"] = this.getConfig("omnislash.gamedata.key", "");

		// send the post query
		let	result = await this.getAppContext().postFromHostToJson(host, path, _params);

		// return the data
		return ObjUtils.GetValue(result, "data", null);
	}
	
	async	retrieveMatchInfoFromOmniSetData(_userId, _matchId, _view="info")
	{
		let	params = {
			"user_id": _userId.toString(),
			"match_id": _matchId,
			"view": _view
		};

		let	result = await this.callFunctionFromOmniSetData("get_view", params);

		// if the result is not null?
		let	error = ObjUtils.GetValue(result, "error", "");
		if (error == "SUCCESS")
			return result;
		else
			return null;
	}

	async	retrieveMatchDataFromOmniSetData(_userId, _matchId)
	{
		let	params = {
			"action": "get_matchdata",
			"user_id": _userId.toString(),
			"match_id": _matchId
		};

		let	result = await this.callFunctionFromOmniSetData("maintenance", params);

		// if the result is not null?
		let	matchData = ObjUtils.GetValue(result, "matchdata", null);
		if (matchData == null)
			matchData = ObjUtils.GetValue(result, "rawdata", null);

		return matchData;
	}	

	async	getFromHostToJson(_host, _path, _queryParams = {}, _port=443, _headers={})
	{
		return await this.__appContext.getFromHostToJson(_host, _path, _queryParams, _port, _headers);
	}

}

module.exports = {
	AppService
};