import { WebClientOptions } from '@vertx/web-client/options';
import { WebClient } from '@vertx/web-client';
import { MultiMap } from '@vertx/core';
import { Buffer } from '@vertx/core';

import { LogUtils } from 'es4x-utils/src/utils/LogUtils';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { StringUtils } from 'es4x-utils/src/utils/StringUtils';
import { UrlUtils } from 'es4x-utils/src/utils/UrlUtils';
import { QueryUtils } from 'es4x-utils/src/network/QueryUtils';
import { ArrayUtils } from 'es4x-utils/src/utils/ArrayUtils';
import { CoreUtils } from 'es4x-utils/src/utils/CoreUtils';
import { CacheManager } from 'es4x-cache/src/CacheManager';

import { PGDBMgr } from 'es4x-sdk-pgsql/src/PGDBMgr';
import { GoogleAPI } from 'es4x-sdk-gcp/src/GoogleAPI';

class	AbstractServiceContext
{
	static	get	TRANSFORM_IDS_TO_OBJECTS()		{	return "ids_to_objects";	}

	static	get	ENV_PRODUCTION()				{	return "production"; }
	static	get	ENV_STAGING()					{	return "staging"; }
	static	get	ENV_DEVELOPMENT()				{	return "development"; }
	static	get	ENV_LOCAL()						{	return "local"; }

	static	get	SOURCE_METHOD()					{	return "method"; }
	static	get	SOURCE_FILTERS()				{	return "filters"; }
	static	get	SOURCE_BODY()					{	return "body"; }

	static	get	SOURCE_TYPE_AUTH_USER_ID()		{	return "auth_user_id";	}

	static	get	CACHE_EXPIRATION_BATCH()		{	return 500;	}
	static	get	CACHE_ACTION_DELETE()			{	return "delete";	}

	constructor(_vertx, _env, _isAdmin = false)
	{
		this.__vertx = _vertx;
		this.__env = _env;
		this.__isAdmin = _isAdmin;

		// load all the services
		this.__serviceHosts = this.getServicesHostConfig(_env);

		// config
		this.__config = null;

		// init the web, db and others to null
		this.__webClient = null;
		this.__googleApi = null;
		this.__db = {};

		// cache
		this.__cacheMgr = null;

		// main service
		this.__mainService = null;
	}

	getIsLocal()
	{
		return this.__env == AbstractServiceContext.ENV_LOCAL;
	}

	static	VerifyEnv(_env)
	{
		// empty?
		if (StringUtils.IsEmpty(_env) == true)
			return AbstractServiceContext.ENV_LOCAL;

		// to lower case
		_env = _env.toLowerCase();

		// PRODUCTION?
		if (["prod", "production"].includes(_env) == true)
			return AbstractServiceContext.ENV_PRODUCTION;

		// STAGING?
		if (["staging"].includes(_env) == true)
			return AbstractServiceContext.ENV_STAGING;

		// DEV?
		if (["dev", "development"].includes(_env) == true)
			return AbstractServiceContext.ENV_DEVELOPMENT;

		// local
		return AbstractServiceContext.ENV_LOCAL;
	}

	async	init(_service, _config)
	{
		// save the service
		this.__mainService = _service;

		// save the config
		this.__config = _config;

		// start the cache?
		let	useCache = this.getConfigToBool("cache.activated");
		if (useCache == true)
		{
			// get the host url
			let	cacheUrl = this.getConfigToString("cache.url");

			// try to create it
			this.__cacheMgr = await CacheManager.Create(this.__vertx, cacheUrl);
			if (this.__cacheMgr == null)
			{
				LogUtils.LogError("Error: couldn't launch the cache at: " + cacheUrl);				
			}
		}

		return true;
	}

	isMainServiceEqual(_code)
	{
		if (this.__mainService != null)
			return this.__mainService.getServiceCode() == _code;
		else
			return false;
	}

	getServicesHostConfig(_env)
	{
		throw new Error("Abstract Method has no implementation");
	}		

	getNotificationSenderService()
	{
		// override this method and return the name of the service that sends notifications
		return "";
	}

	getNotificationSenderPath()
	{
		// override and return the path of the service that sends notifications
		return "";
	}

	getTaskProcessorService()
	{
		// override this method and return the name of the service that processes tasks
		return "";
	}

	getTaskProcessorPath()
	{
		// override and return the path of the service that processes tasks
		return "";
	}

	getAdminKeySecret()
	{
		// override and return a string to encode the admin keys
		return "12345";
	}

	getBatchTypeWithoutCache()
	{
		// override this method to return a list of batch items for which you don't want to use the cache for
		return [];
	}

	async	getItemInfoBatchCustom(_ids, _type, _authUserId = 0)
	{
		// override this method to load a batch of objects information
		return {};
	}

	async	getValueFromSourceInternal(_source, _filters, _authUserId, _parameter, _userId)
	{
		// override this method to get a specific value from the source
		return null;
	}

	isAdmin()
	{
		return this.__isAdmin;
	}

	getCache()
	{
		return this.__cacheMgr;
	}

	hasCache()
	{
		return this.__cacheMgr != null;
	}

	async	cache_del(_category, _key)
	{
		if (this.hasCache() == false)
			return false;
		return await this.getCache().del(_category, _key);
	}

	async	cache_set(_category, _key, _val, _expirationSec = 0)
	{
		if (this.hasCache() == false)
			return false;
		return await this.getCache().set(_category, _key, _val, _expirationSec);
	}

	async	cache_get(_category, _key, _default = null)
	{
		if (this.hasCache() == false)
			return _default;
		return await this.getCache().get(_category, _key, _default);
	}

	async	cache_setMulti(_category, _keyValues, _expirationSec = 0)
	{
		if (this.hasCache() == false)
			return false;
		return await this.getCache().setMulti(_category, _keyValues, _expirationSec);
	}

	async	cache_getMulti(_category, _keys)
	{
		if (this.hasCache() == false)
		{
			return {
				"found": {},
				"missing": _keys
			};
		}

		return await this.getCache().getMulti(_category, _keys);
	}

	getGoogleApi()
	{
		// lazy loading
		if (this.__googleApi == null)
		{
			// get the region and key
			let	region = this.getConfigToString("gcp.region");
			let	key = this.getConfig("gcp.key");

			// create it
			this.__googleApi = new GoogleAPI(this.__vertx, region, key, this.getIsLocal());
		}

		return this.__googleApi;
	}

	async	sendNotification(_payload, _delaySec = 0)
	{
		// get the service and path
		let	service = this.getNotificationSenderService();
		let	path = this.getNotificationSenderPath();

		// if we have it, we can do it!
		if ( (StringUtils.IsEmpty(service) == false) && (StringUtils.IsEmpty(path) == false) )
		{
			return await this.createGoogleTask(service, path, _payload, _delaySec);
		}
		else
		{
			LogUtils.LogError("Error: no notification sender service has been configured!");
			return 500;
		}
	}

	async	createTaskProcess(_service, _model, _action, _filters = {}, _data = {}, _callbackInfo = null, _delaySec = 0, _priority = 1)
	{
		// get the service and path
		let	service = this.getTaskProcessorService();
		let	path = this.getTaskProcessorPath();

		// if we have it, we can do it!
		if ( (StringUtils.IsEmpty(service) == false) && (StringUtils.IsEmpty(path) == false) )
		{
			// prepare the payload
			let	payload = {
				"service": _service,
				"model": _model,
				"action": _action,
				"task_filters": _filters,
				"task_data": _data,
				"task_callback": _callbackInfo,
				"priority": _priority,
				"delay": _delaySec
			};

			// create the task
			let	ret = await this.postFromServiceToJson(service, path, payload);

			if (ret == null)
			{
				LogUtils.LogError("Error creating the task", payload);
				return 500;
			}
			else
			{
				return 200;
			}
		}
		else
		{
			LogUtils.LogError("Error: no task processor service has been configured!");
			return 500;
		}
	}

	async	createGoogleTask(_service, _path, _payload, _delaySec = 0, _queue = "")
	{
		let	queue = StringUtils.IsEmpty(_queue) ? _service : _queue;
		let	host = this.getHost(_service);
		if (StringUtils.IsEmpty(host) == true)
			return 500;
			
		let url = "https://" + host + _path;
		let	method = "POST";
	
		let	googleApi = this.getGoogleApi();
		return await googleApi.task_create(queue, url, method, _payload, _delaySec);		
	}	

	getConfig(_key, _default = null)
	{
		return ObjUtils.GetValue(this.__config, _key, _default);
	}

	getConfigToString(_key, _default = "")
	{
		return ObjUtils.GetValueToString(this.__config, _key, _default);
	}

	getConfigToBool(_key, _default = false)
	{
		return ObjUtils.GetValueToBool(this.__config, _key, _default);
	}

	getPGDBMgr(_connectionKey = "default")
	{
		// do we already have it?
		if (this.__db.hasOwnProperty(_connectionKey) == false)
		{
			// get the config for it
			let	newDB = null;
			let	connectionConfig = this.getConfig("databases." + _connectionKey);
			if (connectionConfig == null)
				LogUtils.LogError("No DB Configuration found for: '" + _connectionKey + "'!");
			else
			{
				// create the new connection
				newDB = PGDBMgr.Create(this.__vertx, connectionConfig.host, connectionConfig.user, connectionConfig.password, connectionConfig.name, connectionConfig.port);
			}

			// save it
			this.__db[_connectionKey] = newDB;
		}

		return this.__db[_connectionKey];
	}

	appendAdminKey(_uri)
	{
		// are we in admin mode?
		if (this.__isAdmin == true)
		{
			// if the url doesnt have ?, we add it
			if (_uri.includes("?") == false)
				_uri = _uri += "?";

			// generate a key
			let	key = StringUtils.GenerateUUID();

			// encode the key
			let	encodedKey = this.encodeAdminKey(key);

			// add the parameters
			if (_uri.endsWith("?") == false)
				_uri += "&";
			_uri += "admin_key1=" + key + "&admin_key2=" + encodedKey;
		}

		return _uri;
	}

	filtersContainAdminKey(_filters)
	{
		// get the key
		let	key = ObjUtils.GetValueToString(_filters, "admin_key1");
		if (StringUtils.IsEmpty(key) == true)
			return false;

		// get the encoded key
		let encodedKey = ObjUtils.GetValueToString(_filters, "admin_key2");
		if (StringUtils.IsEmpty(encodedKey) == true)
			return false;

		// encode it and compare
		let	encodedKeyReal = this.encodeAdminKey(key);
		return encodedKey == encodedKeyReal;
	}

	encodeAdminKey(_key)
	{
		let	keyToEncode = _key + this.getAdminKeySecret();
		return StringUtils.SHA256(keyToEncode);
	}

	async	forwardQueryToService(_service, _ctx, _bodyAdditional = null, _postProcessing = null, _authUserId = 0, _preProcessing = null, _cachePostProcessing = [])
	{
		let	query = QueryUtils.create(_ctx);
		try
		{
			// get the full URI
			let	uri = query.getFullURI();

			// add fields to the uri?
			let	preProcessQueryParamsInstructions = ObjUtils.GetValue(_preProcessing, "query_params", []);
			let	filters = query.getPathAndQueryParams();
			uri = await this.preProcessQueryParameters(uri, preProcessQueryParamsInstructions, filters, _authUserId);

			// add the admin key
			uri = this.appendAdminKey(uri);

			// determine the method
			let	method = query.getMethod();

			// get the body from the request
			let	bodyParams = query.postParams();

			// add the additional body parameters to the query params
			bodyParams = ObjUtils.Merge(bodyParams, _bodyAdditional);

			// do we have to pre process some parameters?
			let	preProcessBodyInstructions = ObjUtils.GetValue(_preProcessing, "body", []);
			let	preProcessBodyParams = await this.preProcessBodyParameters(preProcessBodyInstructions, filters, _authUserId);
			bodyParams = ObjUtils.Merge(bodyParams, preProcessBodyParams);

			LogUtils.Log("FORWARD QUERY:", {
				"uri": uri,
				"method": method,
				"params": bodyParams,
				"pre_processing": (_preProcessing != null).toString(),
				"post_processing": (_postProcessing != null).toString()
			});
	
			// forward the query
			let	result = await this.queryService(method, _service, uri, bodyParams);
	
			// get the data to JSON
			let	jsonData = this.queryResultToJson(result, _service + ":" + uri, bodyParams);
			if (jsonData != null)
			{
				// post processing
				jsonData = await this.postProcessResult(jsonData, _postProcessing, filters, bodyParams, _authUserId);

				// cache post processing
				await this.cachePostProcessing(_cachePostProcessing, filters, bodyParams, jsonData, _authUserId);

				// return it
				query.responseJSON(jsonData);
			}
			else
			{
				query.responseFromServiceResult(result);
			}
		}
		catch(e)
		{
			LogUtils.LogException(e);
			query.responseException(e);
		}		
	}

	async	cachePostProcessing(_cachePostProcessingActions, _filters, _body, _jsonData, _authUserId)
	{
		// empty list of actions?
		if (ArrayUtils.IsEmpty(_cachePostProcessingActions) == true)
			return;

		// process each action
		for(let action of _cachePostProcessingActions)
		{
			// process it
			await this.cachePostProcessingAction(action, _filters, _body, _jsonData, _authUserId);
		}
	}

	async	cachePostProcessingAction(_actionInfo, _filters, _body, _jsonData, _authUserId)
	{
		// extract the action, category and key
		let	realAction = ObjUtils.GetValue(_actionInfo, "action", "");
		let	cacheCategory = ObjUtils.GetValue(_actionInfo, "category", "");
		let	cacheKeySource = ObjUtils.GetValue(_actionInfo, "key", null);
		let	cacheKey = await this.extractValue(cacheKeySource, _filters, _body, _jsonData, _authUserId);

		// something not right?
		if ( (StringUtils.IsEmpty(realAction) == true) || (StringUtils.IsEmpty(cacheCategory) == true) || (cacheKey == null) )
			return;

		// depending on the action
		// - DELETE
		if (realAction == AbstractServiceContext.CACHE_ACTION_DELETE)
		{
			await this.cache_del(cacheCategory, cacheKey);
		}
	}

	async	extractValue(_sourceInfo, _filters, _body, _jsonData, _authUserId)
	{
		// get the source
		let	source = ObjUtils.GetValue(_sourceInfo, "source", "");

		// from a method?
		if (source == AbstractServiceContext.SOURCE_METHOD)
		{
			let	method = ObjUtils.GetValue(_sourceInfo, "source_method", "");
			let	parameter = ObjUtils.GetValue(_sourceInfo, "parameter", "");
			let	userIdLocation = ObjUtils.GetValue(_sourceInfo, "auth_user_id", "");

			return this.getValueFromSource(method, _filters, _authUserId, parameter, userIdLocation);
		}
		// from filters?
		else if (source == AbstractServiceContext.SOURCE_FILTERS)
		{
			let	parameter = ObjUtils.GetValue(_sourceInfo, "parameter", "");
			
			return ObjUtils.GetValue(_filters, parameter);
		}
		// from body?
		else if (source == AbstractServiceContext.SOURCE_BODY)
		{
			let	parameter = ObjUtils.GetValue(_sourceInfo, "parameter", "");
			
			return ObjUtils.GetValue(_body, parameter);
		}

		return null;
	}

	async	preProcessQueryParameters(_uri, _instructions, _filters, _authUserId = 0)
	{
		// if the url doesnt have ?, we add it
		if (_uri.includes("?") == false)
			_uri = _uri + "?";

		// do each one
		for(let i=0; i<_instructions.length; i++)
		{
			// get the source and name of parameter
			let	parameter = ObjUtils.GetValue(_instructions[i], "parameter", "");
			let	source = ObjUtils.GetValue(_instructions[i], "source", "");
			let	userIdLocation = ObjUtils.GetValue(_instructions[i], "user_id", "auth_user_id");

			// are they good?
			if ( (StringUtils.IsEmpty(parameter) == false) && (StringUtils.IsEmpty(source) == false) )
			{
				// get the value
				let	value = await this.getValueFromSource(source, _filters, _authUserId, parameter, userIdLocation);
				if (value != null)
				{
					if (_uri.endsWith("?") == false)
						_uri += "&";
					_uri += parameter + "=" + value;
				}
			}
		}

		return _uri;
	}

	async	preProcessBodyParameters(_instructions, _filters, _authUserId = 0)
	{
		let	bodyParameters = {};

		// do each one
		for(let i=0; i<_instructions.length; i++)
		{
			// get the source and name of parameter
			let	parameter = ObjUtils.GetValue(_instructions[i], "parameter", "");
			let	source = ObjUtils.GetValue(_instructions[i], "source", "");
			let	userIdLocation = ObjUtils.GetValue(_instructions[i], "user_id", "auth_user_id");

			// are they good?
			if ( (StringUtils.IsEmpty(parameter) == false) && (StringUtils.IsEmpty(source) == false) )
			{
				// get the value
				let	value = await this.getValueFromSource(source, _filters, _authUserId, parameter, userIdLocation);
				if (value != null)
					bodyParameters[parameter] = value;
			}
		}

		return bodyParameters;
	}

	async	postProcessResult(_result, _postProcessing, _filters, _data, _authUserId = 0)
	{
		if (_postProcessing == null)
			return _result;

		// do we have something to do?
		// - transform: BEFORE POPULATE
		let	transformInstructions = ObjUtils.GetValue(_postProcessing, "transform", []);
		_result = await this.transformItemsFromInstructions(_result, transformInstructions, _filters, _data, _authUserId, true);

		// - populate
		let	populateInstructions = ObjUtils.GetValue(_postProcessing, "populate", []);
		_result = await this.populateItemsFromInstructions(_result, populateInstructions, _authUserId);

		// - transform: AFTER POPULATE
		_result = await this.transformItemsFromInstructions(_result, transformInstructions, _filters, _data, _authUserId, false);

		return _result;
	}

	async	queryServiceToJSON(_method, _service, _uri, _queryParams = {}, _port = 443)
	{
		// query the service
		let	result = await this.queryService(_method, _service, _uri, _queryParams, _port);

		// return the result as JSON
		return this.queryResultToJson(result, _service + ":" + _uri, _queryParams);
	}

	async	queryService(_method, _service, _uri, _queryParams = {}, _port = 443)
	{
		// get the host for that service
		let	host = this.getHost(_service);
		if (host == "")
			return null;
		else
			return await this.queryHost(_method, host, _uri, _queryParams, _port);
	}

	async	getFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		// get the host for that service
		let	host = this.getHost(_service);
		if (host == "")
			return null;
		else
			return await this.getFromHostToJson(host, _path, _queryParams, _port);
	}

	async	getFromHostToJson(_host, _path, _queryParams = {}, _port=443, _headers={})
	{
		// add the query params to the path
		let	fullPath = _path;
		let	params = ObjUtils.Join(_queryParams, "=", "&");
		if (params != "")
		{
			fullPath += "?" + params;
		}
		
		return await this.getFromHostAndURIToJson(_host, fullPath, _port, _headers);
	}

	async	queryHost(_method, _host, _uri, _queryParams = {}, _port = 443)
	{
		// execute the query
		try
		{
			// get the web client
			let	webClient = this.getWebClient();
			if (webClient == null)
			{
				LogUtils.LogError("Webclient is null!");
				return null;
			}

			// do the query
			let	result = null;
			LogUtils.Log("Query " + _method + " > https://" + _host + _uri);
			// - GET
			if (_method == QueryUtils.HTTP_METHOD_GET)
			{
				// encode the parameters
				let	params = ObjUtils.Join(_queryParams, "=", "&");
				if (params != "")
					_uri += "?" + params;

				// create the request
				result = await webClient.get(_port, _host, _uri).send();
			}
			// - POST
			else if (_method == QueryUtils.HTTP_METHOD_POST)
			{
				result = await webClient.post(_port, _host, _uri).sendJson(_queryParams);
			}
			// - PUT
			else if (_method == QueryUtils.HTTP_METHOD_PUT)
			{
				result = await webClient.put(_port, _host, _uri).sendJson(_queryParams);
			}
			// - DELETE
			else if (_method == QueryUtils.HTTP_METHOD_DEL)
			{
				result = await webClient.delete(_port, _host, _uri).sendJson(_queryParams);
			}

			return result;
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}			
	}

	async	getFromHostAndURI(_host, _uri, _port=443, _headers={})
	{	
		// execute the query
		try
		{
			// get the web client
			let	webClient = this.getWebClient();
			if (webClient == null)
			{
				LogUtils.LogError("Webclient is null!");
				return null;
			}

			LogUtils.Log("Query to: https://" + _host + _uri);
			let	query = webClient.get(_port, _host, _uri);

			// add the headers
			if (_headers != null)
			{
				for(const key in _headers)
				{
					query = query.putHeader(key, _headers[key]);
				}
			}

			// send it
			let	result = await query.send();

			return result;
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	
	}

	async	deleteFromHostAndURI(_host, _uri, _port=443, _headers={}, _jsonContent = null, _basicUsername = "", _basicPassword = "")
	{	
		// execute the query
		try
		{
			// get the web client
			let	webClient = this.getWebClient();
			if (webClient == null)
			{
				LogUtils.LogError("Webclient is null!");
				return null;
			}

			LogUtils.Log("Query DELETE to: https://" + _host + _uri);
			let	query = webClient.delete(_port, _host, _uri);

			// add the headers
			if (_headers != null)
			{
				for(const key in _headers)
				{
					query = query.putHeader(key, _headers[key]);
				}
			}

			// authentication?
			if ( (StringUtils.IsEmpty(_basicUsername) == false) && (StringUtils.IsEmpty(_basicPassword) == false) )
			{
				query = query.basicAuthentication(_basicUsername, _basicPassword);
			}			

			// send it
			if (ObjUtils.IsValid(_jsonContent) == true)
			{
				return await query.sendJson(_jsonContent);
			}
			else
			{
				return await query.send();
			}
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	
	}	

	async	getFromURI(_uri)
	{	
		// execute the query
		try
		{
			// get the web client
			let	webClient = this.getWebClient();
			if (webClient == null)
			{
				LogUtils.LogError("Webclient is null!");
				return null;
			}

			LogUtils.Log("Query to: " + _uri);
			let	result = await webClient.getAbs(_uri).send();

			return result;
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	
	}	

	async	getFromHostAndURIToJson(_host, _uri, _port=443, _headers={})
	{	
		// make sure we dont have spaces in the url
		_uri = StringUtils.ReplaceAll(_uri, " ", "%20");

		// execute the query
		let	fullUrl = "https://" + _host + _uri;

		LogUtils.Log("GET Query to: " + fullUrl);
		let	result = await this.getFromHostAndURI(_host, _uri, _port, _headers);

		// return the result
		return this.queryResultToJson(result, fullUrl, {}, _headers);
	}
 
	async	postFromServiceToJson(_service, _path, _queryParams = {}, _port=443)
	{
		// get the host for that service
		let	host = this.getHost(_service);
		if (host == "")
			return null;
		else
			return await this.postFromHostToJson(host, _path, _queryParams, _port);
	}
 
	async	postFromHostToJson(_host, _path, _queryParams = {}, _port=443, _basicUsername = "", _basicPassword = "")
	{
		// get the web client
		let	webClient = this.getWebClient();
		if (webClient == null)
		{
			LogUtils.LogError("Webclient is null!");
			return null;
		}
		
		 // execute the query
		try
		{
			let	fullUrl = "https://" + _host + _path;
			LogUtils.Log("POST Query to: " + fullUrl, {params: _queryParams, auth: {username: _basicUsername, pass: _basicPassword}});

			// build the request
			let	request = webClient.post(_port, _host, _path);

			// authentication?
			if ( (StringUtils.IsEmpty(_basicUsername) == false) && (StringUtils.IsEmpty(_basicPassword) == false) )
			{
				request = request.basicAuthentication(_basicUsername, _basicPassword);
			}

			let	result = await request.sendJson(_queryParams);

			// return it
			return this.queryResultToJson(result, fullUrl, _queryParams);
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	 
	}

	queryResultToJson(_result, _fullUrl, _queryParams, _headers = {})
	{
		if (_result != null)
		{
			// all good?
			let	statusCode = _result.statusCode();
			if ( (statusCode >= 200) && (statusCode < 300) )
			{
				// extract the json from the body
				try
				{
					// get the string
					let	resultStr = _result.bodyAsString();
					let	jsonData = {};

					// is it streamed JSON?
					let	isStreamedJSON = ObjUtils.GetValue(_headers, "Accept", "") == "application/x-ndjson";
					if (isStreamedJSON == true)
					{
						jsonData = StringUtils.ParseStreamedJSON(resultStr);
					}
					else
					{
						jsonData = JSON.parse(resultStr);
					}

					return jsonData;
				}
				catch
				{
					LogUtils.LogError("HTTP error parsing the JSON: " + statusCode + ", msg=" + _result.statusMessage(), {
						"url": _fullUrl,
						"params": _queryParams,
						"result": _result.bodyAsString()
					});
					return null;					
				}
			}
			else
			{
				LogUtils.LogError("HTTP error: " + statusCode + ", msg=" + _result.statusMessage(), {
					"url": _fullUrl,
					"params": _queryParams,
					"result": _result.bodyAsString()
				});
				return null;
			}
		}
		else
		{
			LogUtils.LogError("HTTP error: getting the data", {
				"url": _fullUrl,
				"params": _queryParams
			});
			return null;
		}
	}

	async	postFormFromUrlToJson(_url, _queryParams = "", _body = {}, _port=443, _headers={})
	{
		// extract the info from the url
		let	urlData = UrlUtils.ExtractInfo(_url);
	
		// make sure to encode the options
		let	finalOptions = UrlUtils.UrlEncodeQueryParameters(_queryParams);
	
		let	finalQuery = urlData.path;
		if (StringUtils.IsEmpty(finalOptions) == false)
			finalQuery += "?" + finalOptions;
	
		return await this.postFormFromHostToJson(urlData.host, finalQuery, _body, _port, _headers);		
	}

	async	postFormFromHostToJson(_host, _path, _body = {}, _port=443, _headers={})
	{
		// get the web client
		let	webClient = this.getWebClient();
		if (webClient == null)
		{
			LogUtils.LogError("Webclient is null!");
			return null;
		}
		
		// execute the query
		try
		{
			// prepare the map
			let	map = MultiMap.caseInsensitiveMultiMap();
			for(const key in _body)
				map.add(key, _body[key]);

			// build the full url
			let fullUrl =  "https://" + _host + _path;
			LogUtils.Log("POST Query to: " + fullUrl);
			let	query = webClient.post(_port, _host, _path);

			// add the headers
			if (_headers != null)
			{
				for(const key in _headers)
				{
					query = query.putHeader(key, _headers[key]);
				}
			}

			// send it
			let	result = await query.sendForm(map);

			// return the result
			return this.queryResultToJson(result, fullUrl, _body);
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	 
   }

   async	postContentFromHostToJson(_host, _path, _content, _port=443, _headers={})
   {
		// get the web client
		let	webClient = this.getWebClient();
		if (webClient == null)
		{
			LogUtils.LogError("Webclient is null!");
			return null;
		}
		
		// execute the query
		try
		{
			// POST it
			let query = webClient.post(_port, _host, _path);

			// add the headers
			if (_headers != null)
			{
				for(const key in _headers)
				{
					query = query.putHeader(key, _headers[key]);
				}
			}
			
			// send it
			let	result = await _request.sendBuffer(Buffer.buffer(_data));

			// return the result
			return this.queryResultToJson(result, fullUrl, _queryParams);
		}
		catch(e)
		{
			LogUtils.LogException(e);
			return null;
		}	 
	}

	getHost(_service)
	{
		// do we have it?
		if (this.__serviceHosts.hasOwnProperty(_service) == true)
			return this.__serviceHosts[_service];
		else
		{
			LogUtils.LogError("Can't find host for '" + _service + "'!");
			return "";
		}
	}

	getWebClient()
	{
		// lazy load the web client only when we need it
		if (this.__webClient == null)
		{
			let	opt = new WebClientOptions();
			opt.setSsl(true);
			opt.setTrustAll(true);				 

			this.__webClient = WebClient.create(this.__vertx, opt);
		}

		// return it
		return this.__webClient;
	}

	async	populateItemsFromInstructions(_items, _instructions, _authUserId = 0)
	{
		for(let i=0; i<_instructions.length; i++)
		{
			_items = await this.populateItems(_items, _instructions[i]["type"], _instructions[i]["field_id"], _instructions[i]["field_info"], _authUserId, ObjUtils.GetValue(_instructions[i], "depth", -1), ObjUtils.GetValue(_instructions[i], "path", ""));	
		}

		return _items;
	}

	async	populateItems(_items, _type, _fieldId, _fieldTarget, _authUserId = 0, _depthMax = -1, _path = "")
	{
		// do we have a path?
		let	objToLookInto = _items;
		if (StringUtils.IsEmpty(_path) == false)
			objToLookInto = ObjUtils.GetValue(_items, _path);

		// make the list of all the users
		let	ids = ObjUtils.GetValueRecursive(objToLookInto, _fieldId, _depthMax);
		if (ids.length > 0)
		{
			LogUtils.Log("populating for type '" + _type + " with " + ids.length + " ids");
			// send the batch request
			let	infoDict = await this.getItemInfoBatch(ids, _type, _authUserId);

			// replace them
			objToLookInto = ObjUtils.ReplaceValueRecursive(objToLookInto, _fieldId, infoDict, _fieldTarget, null, _depthMax);
		}

		// do we have a path?
		if (StringUtils.IsEmpty(_path) == false)
			_items = ObjUtils.SetValue(_items, _path, objToLookInto);

		return _items;
	}

	async	transformItemsFromInstructions(_items, _instructions, _queryFilters, _queryData, _authUserId = 0, _beforePopulate = true)
	{
		for(let i=0; i<_instructions.length; i++)
		{
			_items = await this.transformItems(_items, _instructions[i]["type"], _instructions[i], _queryFilters, _queryData, _authUserId, _beforePopulate);	
		}

		return _items;
	}	

	async	transformItemsCustom(_items, _type, _filters, _queryFilters, _queryData, _authUserId = 0, _beforePopulate = true)
	{
		// override this method to handle specific transformations
		return _items;
	}

	async	transformItems(_items, _type, _filters, _queryFilters, _queryData, _authUserId = 0, _beforePopulate = true)
	{
		// IDS TO OBJECTS?
		if ( (_type == AbstractServiceContext.TRANSFORM_IDS_TO_OBJECTS) && (_beforePopulate == true) )
		{
			// is the list of ids in a field?
			let	fieldsToDo = ObjUtils.GetValue(_filters, "fields", []);
			let	field = ObjUtils.GetValue(_filters, "field", "");
			if (StringUtils.IsEmpty(field) == false)
				fieldsToDo.push(field);

			// get the list of ids
			let	ids = _items;
			if (fieldsToDo.length > 0)
			{
				ids = [];
				for(let fieldBuf of fieldsToDo)
					ids = ids.concat(ObjUtils.GetValue(_items, fieldBuf, []));
			}

			// convert the ids to objects
			let	itemsIsArray = CoreUtils.IsArray(_items) && (fieldsToDo.length > 0);
			let	convertedObjects = [];
			let	keepAssoc = ObjUtils.GetValueToBool(_filters, "keep_assoc");
			if (CoreUtils.IsArray(ids) == true)
			{
				if (ids.length > 0)
				{
					// get the type of objects
					let	dataType = ObjUtils.GetValue(_filters, "data_type", "");
					if (StringUtils.IsEmpty(dataType) == false)
					{
						// get the objects from the batch
						let	infoDict = await this.getItemInfoBatch(ids, dataType, _authUserId);

						// do we need to keep the association?
						if ( (keepAssoc == true) || (itemsIsArray == true) )
							convertedObjects = infoDict;
						else
						{
							// extract them
							for(let i=0; i<ids.length; i++)
							{
								let	objBuf = ObjUtils.GetValue(infoDict, ids[i]);
								if (objBuf != null)
									convertedObjects.push(objBuf);
							}	
						}
					}
				}
			}

			// empty array but we need an assoc?
			if ( ( (keepAssoc == true) || (itemsIsArray == true) ) && (CoreUtils.IsArray(convertedObjects) == true) )
				convertedObjects = {};

			// replace it in the object
			if (fieldsToDo.length == 0)
				return convertedObjects;
			else
			{
				// if the items is actually a list
				if (itemsIsArray == true)
				{
					// we're going to have to iterate through each one
					for(let fieldBuf of fieldsToDo)
					{
						_items = ObjUtils.ReplaceAllIdsWithObjectInList(_items, fieldBuf, convertedObjects, keepAssoc);
					}
				}
				else
				{
					for(let fieldBuf of fieldsToDo)
						_items = ObjUtils.SetValue(_items, fieldBuf, convertedObjects, false);
				}

				return _items;
			}
		}
		// custom
		else
		{
			return await this.transformItemsCustom(_items, _type, _filters, _queryFilters, _queryData, _authUserId, _beforePopulate);
		}
	}

	async	getItemInfoBatch(_ids, _type, _authUserId = 0)
	{
		// check in the cache first
		let	typeWithoutCache = this.getBatchTypeWithoutCache();
		let	useCache = typeWithoutCache.includes(_type) == false;
		let	existingItems = {};
		if (useCache == true)
		{
			// look in the cache
			let	cacheRet = await this.cache_getMulti(_type, _ids);

			// if we have all of them, we return it right away
			if (cacheRet.missing.length == 0)
			{
				return cacheRet.found;
			}
			// otherwise we change the ids to get
			else
			{
				existingItems = cacheRet.found;
				_ids = cacheRet.missing;
			}
		}

		// get the items
		let	items = await this.getItemInfoBatchCustom(_ids, _type, _authUserId);

		// use the cache?
		if (useCache == true)
		{
			// save the new items found
			await this.cache_setMulti(_type, items, AbstractServiceContext.CACHE_EXPIRATION_BATCH);

			// merge the final result
			items = ObjUtils.Merge(existingItems, items);
		}

		return items;
	}

	async	getValueFromSource(_source, _filters, _authUserId = 0, _parameter = "", _userIdLocation = "auth_user_id")
	{
		// determine the user id
		let	userId = _authUserId;
		if ( (StringUtils.IsEmpty(_userIdLocation) == false) && (_userIdLocation != "auth_user_id") )
			userId = ObjUtils.GetValueToInt(_filters, _userIdLocation);
			
		// AUTH USER ID?
		let	value = null;
		if (_source == AbstractServiceContext.SOURCE_TYPE_AUTH_USER_ID)
		{
			value = _authUserId;
		}
		else
		{
			value = await this.getValueFromSourceInternal(_source, _filters, _authUserId, _parameter, userId);
		}

		return value;
	}
}

module.exports = {
	AbstractServiceContext
};
