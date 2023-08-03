
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { ArrayUtils } from 'es4x-utils/src/utils/ArrayUtils';
import { DateUtils } from 'es4x-utils/src/utils/DateUtils';
import { StringUtils } from 'es4x-utils/src/utils/StringUtils';
import { PGDBMgr } from 'es4x-sdk-pgsql/src/PGDBMgr';
import { GoogleAPI } from 'es4x-sdk-gcp/src/GoogleAPI';


class	AbstractModel
{
	static	get	ACTION_LIST()				{	return "list"; }
	static	get	ACTION_LIST_BATCH()			{	return "list_batch"; }
	static	get	ACTION_READ()				{	return "read"; }
	static	get	ACTION_CREATE()				{	return "create"; }
	static	get	ACTION_CREATE_BATCH()		{	return "create_batch"; }
	static	get	ACTION_UPDATE()				{	return "update"; }
	static	get	ACTION_DELETE()				{	return "delete"; }
	static	get	ACTION_BATCH_WRITE()		{	return "batch_write"; }

	static	get	DATASOURCE_PGSQL()			{	return "pgsql";	}
	static	get	DATASOURCE_FIRESTORE()		{	return "firestore";	}

	static	get	NO_LIMIT()					{	return -1000;	}

	constructor(_service, _config)
	{
		// save the service
		this.__service = _service;

		// load from the configuration
		this.__code = ObjUtils.GetValueToString(_config, "model");
		this.__datasource = ObjUtils.GetValueToString(_config, "datasource");
		this.__table = ObjUtils.GetValueToString(_config, "table");
		this.__firestorePath = ObjUtils.GetValueToString(_config, "firestore_path");
		this.__canUpdate = ObjUtils.GetValueToBool(_config, "can_update");
		this.__canDelete = ObjUtils.GetValueToBool(_config, "can_delete");
		this.__orderByOptions = ObjUtils.GetValue(_config, "order_by_options", []);
		this.__paginationActive = ObjUtils.GetValueToBool(_config, "pagination.active", true);
		this.__paginationSize = ObjUtils.GetValueToInt(_config, "pagination.default_page_size", 20);
	}

	isValid()
	{
		return StringUtils.IsEmpty(this.__code) == false;
	}

	getOrderByOptions()
	{
		return this.__orderByOptions;
	}

	getModelCode()
	{
		return this.__code;
	}

	getMainTable()
	{
		return this.__table;
	}	

	getFirestorePath(_filters)
	{
		return this.__firestorePath;
	}

	getDataSource()
	{
		return this.__datasource;
	}

	async	canUpdate(_filters, _data)
	{
		return this.__canUpdate;
	}

	async	canDelete(_filters)
	{
		return this.__canDelete;
	}

	async	prepareDataForCreate(_filters, _data)
	{
		throw new Error("Abstract Method has no implementation");
	}




	getConfig(_key, _default = null)
	{
		return this.getService().getConfig(_key, _default);
	}

	getService()
	{
		return this.__service;
	}

	isFirestore()
	{
		return this.getDataSource() == AbstractModel.DATASOURCE_FIRESTORE;
	}
	
	getDBMgr()
	{
		return this.getService().getDBMgr();
	}

	getContext()
	{
		return this.getService().getContext();
	}

	getGoogleApi()
	{
		return this.getService().getGoogleApi();
	}




	async	do(_action, _filters, _data, _callbackData = null, _query = null)
	{
		// depending on the method
		// LIST?
		if (_action == AbstractModel.ACTION_LIST)
		{
			return await this.list(_filters);
		}
		// LIST BATCH?
		else if (_action == AbstractModel.ACTION_LIST_BATCH)
		{
			return await this.listBatch(_filters, _data);
		}
		// READ?
		else if (_action == AbstractModel.ACTION_READ)
		{
			return await this.read(_filters);
		}
		// CREATE?
		else if (_action == AbstractModel.ACTION_CREATE)
		{
			return await this.create(_filters, _data);
		}
		// CREATE BATCH?
		else if (_action == AbstractModel.ACTION_CREATE_BATCH)
		{
			return await this.createBatch(_filters, _data);
		}
		// UPDATE?
		else if (_action == AbstractModel.ACTION_UPDATE)
		{
			return await this.update(_filters, _data);
		}
		// DELETE?
		else if (_action == AbstractModel.ACTION_DELETE)
		{
			return await this.delete(_filters);
		}
		// BATCH WRITE?
		else if (_action == AbstractModel.ACTION_BATCH_WRITE)
		{
			return await this.insertActionToBatchWrite(_filters, _data);
		}
		// CUSTOM
		else
			return await this.doCustom(_action, _filters, _data, _callbackData, _query);
	}	

	async	list(_filters)
	{
		// list the rows
		let	rows = await this.listDb(_filters);

		// process them
		return await this.postReadProcessingList(rows, _filters);
	}	

	getConditionsForListBatch(_filters, _data)
	{
		let	conditions = [
			this.field("id") + "IN$" + _data["ids"].join(" | ")
		];

		return conditions;
	}

	async	listBatch(_filters, _data)
	{
		// empty?
		if (ArrayUtils.IsEmpty(_data["ids"]) == true)
			return {};

		// build the query
		let	tables = this.getTables();
		let	fields = this.getFields();

		// add the list of ids in it
		let	conditions = this.getConditionsForListBatch(_filters, _data);

		// execute
		let	items = await this.queryFromConditionsToList(tables, conditions, fields);

		// post process them
		let	finalItems = await this.postReadProcessingList(items, _filters);

		// convert it to a dictionary
		let	itemsDict = ObjUtils.ArrayToDictionary(finalItems, "id");

		return itemsDict;
	}	

	async	readRawById(_id)
	{
		return await this.read({id: _id, raw: true});
	}

	async	readRawByCode(_id)
	{
		return await this.read({code: _id, raw: true});
	}

	async	read(_filters)
	{
		// read raw?
		let	useRaw = ObjUtils.GetValueToBool(_filters, "raw");

		// look in the cache first
		if (useRaw == false)
		{
			let	resultFromCache = await this.cache_read_get(_filters);
			if (resultFromCache != null)
				return resultFromCache;
		}

		// read from the database
		let	result = await this.readDb(_filters);

		// handle null result
		if (result == null)
			result = await this.handleReadNullResult(_filters);

		// raw?
		if (useRaw == true)
			return result;

		// if we have something, we do some postread processing
		if (result != null)
		{
			// post process it
			result = await this.postReadProcessing(result, _filters);

			// save it in the cache?
			await this.cache_read_set(result, _filters);
		}

		return result;	
	}

	async	create(_filters, _data)
	{
		// clean up the data
		let	realData = await this.prepareDataForCreate(_filters, _data);
		if (realData == null)
			return null;

		// insert and return the object
		return await this.createDb(realData);
	}	

	async	createBatch(_filters, _data)
	{
		// insert multi
		return await this.queryInsertBatch(_data);
	}

	async	update(_filters, _data, _addUpdatedAt = false)
	{
		// make sure we can
		let	ok = await this.canUpdate(_filters, _data);
		if (ok == false)
			return null;

		// clean up the data
		let	realData = await this.prepareDataForUpdate(_filters, _data);
		if (realData == null)
			return null;

		// update it
		let	ret = await this.updateDb(_filters, realData, _addUpdatedAt);

		// post update
		if (ret == true)
		{
			await this.postUpdate(_filters, _data, realData);
		}

		return ret;
	}	

	async	delete(_filters)
	{
		// make sure we can
		let	ok = await this.canDelete(_filters);
		if (ok == false)
			return false;

		// pre processing
		await this.preDeleteProcessing(_filters);

		// execute
		let	ret = await this.deleteDb(_filters);

		// if good we post process
		if (ret == true)
		{
			// post processing
			await this.postDeleteProcessing(_filters);

			// delete from cache
			await this.cache_delete_del(_filters);
		}

		return ret;
	}	

	async	insertActionToBatchWrite(_filters, _data)
	{
		// get the batch write info
		let	batchInfo = ObjUtils.GetValue(_filters, "info", null);
		if (ObjUtils.IsValid(batchInfo) == false)
			batchInfo = this.firestoreBatch_init();

		// get the type of action
		let	action = ObjUtils.GetValueToString(_filters, "action");
		let	filters = ObjUtils.GetValue(_data, "filters");

		// depending on the action
		// - CREATE
		if (action == AbstractModel.ACTION_CREATE)
		{
			let	realData = ObjUtils.GetValue(_data, "data");
			batchInfo = await this.firestoreBatch_create(batchInfo, filters, realData);
		}
		// - UPDATE
		else if (action == AbstractModel.ACTION_UPDATE)
		{
			let	realData = ObjUtils.GetValue(_data, "data");
			let	addUpdatedAt = ObjUtils.GetValueToBool(_data, "add_updated_at");
			batchInfo = await this.firestoreBatch_update(batchInfo, filters, realData, addUpdatedAt);
		}
		// - DELETE
		else if (action == AbstractModel.ACTION_DELETE)
		{
			batchInfo = await this.firestoreBatch_delete(batchInfo, filters);
		}

		return batchInfo;
	}

	// Override that method to process custom actions
	async	doCustom(_action, _filters, _data, _callbackData=null, _query=null)
	{
		return null;
	}











	async	cache_del(_category, _key)
	{
		return await this.getService().cache_del(_category, _key);
	}

	async	cache_set(_category, _key, _val, _expirationSec = 0)
	{
		return await this.getService().cache_set(_category, _key, _val, _expirationSec);
	}

	async	cache_get(_category, _key, _default = null)
	{
		return await this.getService().cache_get(_category, _key, _default);
	}

	async	cache_setMulti(_category, _keyValues, _expirationSec = 0)
	{
		return await this.getService().cache_setMulti(_category, _keyValues, _expirationSec);
	}

	async	cache_getMulti(_category, _keys)
	{
		return await this.getService().cache_getMulti(_category, _keys);
	}

	cache_read_getKey(_filters)
	{
		return "";
	}

	cache_read_getCategory(_filters)
	{
		return this.getModelCode();
	}

	cache_read_getExpiration()
	{
		return 0;
	}

	async	cache_delete_del(_filters)
	{
		// get the key
		let	key = this.cache_read_getKey(_filters);
		if (StringUtils.IsEmpty(key) == false)
		{
			let	category = this.cache_read_getCategory(_filters);
			return await this.cache_del(category, key);
		}
		else
		{
			return false;
		}
	}

	async	cache_read_get(_filters)
	{
		// get the key
		let	key = this.cache_read_getKey(_filters);
		if (StringUtils.IsEmpty(key) == false)
		{
			let	category = this.cache_read_getCategory(_filters);
			return await this.cache_get(category, key);
		}
		else
		{
			return null;
		}
	}

	async	cache_read_set(_result, _filters)
	{
		// get the key
		let	key = this.cache_read_getKey(_filters);
		if (StringUtils.IsEmpty(key) == false)
		{
			let	category = this.cache_read_getCategory(_filters);
			let	expiration = this.cache_read_getExpiration();
			await this.cache_set(category, key, _result, expiration);
		}
	}




	async	doOnModelRemote(_service, _model, _action, _filters, _data)
	{
		return await this.getService().doOnModelRemote(_service, _model, _action, _filters, _data);
	}

	log(_message, _payload = null)
	{
		this.getService().log(_message, _payload, this.getModelCode());
	}

	logWarning(_message, _payload = null)
	{
		this.getService().logWarning(_message, _payload, this.getModelCode());
	}

	logError(_message, _payload = null)
	{
		this.getService().logError(_message, _payload, this.getModelCode());
	}

	subscribe(_modelCode, _event, _service = "")
	{
		this.getService().addSubscriber(this.getModelCode(), _modelCode, _event, _service);
	}

	isAdmin(_filters)
	{
		return this.getService().isAdmin(_filters);
	}

	async	doOnModel(_model, _action, _filters, _data = null)
	{
		return await this.getService().doOnModel(_model, _action, _filters, _data);
	}




	getTables()
	{
		return [
			this.__table
		];
	}

	getFields(_filters)
	{
		return [];
	}

	async	prepareDataForUpdate(_filters, _data)
	{
		return _data;
	}

	async	getReadQuery(_filters)
	{
		return {
			tables: this.getTables(),
			fields: this.getFields(_filters),
			conditions: this.getConditionForIdOrCode(_filters),
			order_by: [],
			group_by: []
		};
	}

	async	getListQueryPgSql(_filters)
	{
		// prepare the query information
		return {
			tables: this.getTables(),
			fields: this.getFields(_filters),
			conditions: this.getConditionsForList(_filters),
			order_by: this.getOrderBy(_filters),
			group_by: [],
			offset: this.getQueryOffset(_filters),
			limit: this.getQueryLimit(_filters)	
		};
	}

	getQueryLimit(_filters)
	{
		let	limit = 0;
		if (this.__paginationActive == true)
		{
			// limit
			limit = ObjUtils.GetValueToInt(_filters, "limit", this.__paginationSize);

			// no limit
			if (limit == AbstractModel.NO_LIMIT)
				return 0;
			else if (limit <= 0)
				limit = this.__paginationSize;
		}
		return limit;
	}

	getQueryOffset(_filters)
	{
		let	offset = 0;
		if (this.__paginationActive == true)
		{
			// offset
			offset = ObjUtils.GetValueToInt(_filters, "offset");
			if (offset < 0)
				offset = 0;
		}
		return offset;
	}

	getOrderBy(_filters)
	{
		// get the options
		let	options = this.getOrderByOptions();

		// nothing?
		if (ArrayUtils.IsEmpty(options) == true)
			return [];

		// get the value in parameter
		let	value = ObjUtils.GetValueToString(_filters, "order_by").toLowerCase();

		// is it part of the options?
		if (options.includes(value) == false)
			value = options[0];
		
		// contains desc?
		if (value.endsWith("_desc") == true)
		{
			value = "-" + value.replace("_desc", "");
		}

		// return it
		return [
			value
		];
	}

	getConditionsForList(_filters)
	{
		return [];
	}

	getFirestorePathAndIdToObject(_filters)
	{
		return {
			path: this.getFirestorePath(_filters),
			id: this.getFirestoreObjectId(_filters)
		};
	}	

	getFirestoreObjectId(_filters)
	{
		// id?
		if (ObjUtils.HasProperty(_filters, "id") == true)
			return _filters["id"];
		// code?
		else if (ObjUtils.HasProperty(_filters, "code") == true)
			return _filters["code"];
		else
			return "";
	}

	async	readDb(_filters)
	{
		// FIRESTORE?
		if (this.isFirestore() == true)
		{
			// get the path and id
			let	pathAndId = this.getFirestorePathAndIdToObject(_filters);

			// read Firestore
			let	ret = await this.getGoogleApi().firestore_get(pathAndId.path, pathAndId.id);

			return ObjUtils.GetValue(ret, "data");
		}
		// PGSQL
		else
		{
			return await this.readPgSql(_filters);
		}
	}

	async	readPgSql(_filters)
	{
		// build the query
		let	query = await this.getReadQuery(_filters);
		if (query.conditions.length == 0)
			return null;

		// verify the rest
		if (ObjUtils.HasProperty(query, "order_by") == false)
			query["order_by"] = [];
		if (ObjUtils.HasProperty(query, "group_by") == false)
			query["group_by"] = [];

		// execute
		return await this.queryFromConditionsToRow(query.tables, query.conditions, query.fields, query.order_by, 0, query.group_by);
	}

	async	handleReadNullResult(_filters)
	{
		return null;
	}

	async	listDb(_filters)
	{
		// FIRESTORE?
		if (this.isFirestore() == true)
		{
			// get the query info
			let	queryInfo = await this.getListQueryFirestore(_filters);

			// execute it
			return await this.firestoreList(queryInfo.path, queryInfo.order_by, queryInfo.limit);
		}
		// PGSQL
		else
		{
			// get the query
			let	queryInfo = await this.getListQueryPgSql(_filters);

			// execute
			return await this.queryFromConditionsToList(queryInfo.tables, queryInfo.conditions, queryInfo.fields, queryInfo.order_by, queryInfo.limit, queryInfo.group_by, queryInfo.offset);
		}		
	}

	async	getListQueryFirestore(_filters)
	{
		return {
			path: this.getFirestorePath(_filters),
			order_by: this.getOrderBy(_filters),
			limit: this.getQueryLimit(_filters)
		};
	}

	async	postReadProcessing(_result, _filters)
	{
		return _result;
	}

	async	postReadProcessingList(_listOfResults, _filters)
	{
		let	finalList = [];
		for(let result of _listOfResults)
		{
			let	newResult = await this.postReadProcessing(result, _filters);
			if (newResult != null)
				finalList.push(newResult);
		}
		return finalList;
	}

	async	queryInsertFirestore(_realData, _returnId = true)
	{
		// get the path
		let	path = this.getFirestorePath(_realData);
		if (StringUtils.IsEmpty(path) == true)
			return _returnId ? "" : null;

		let	documentId = ObjUtils.GetValue(_realData, "id", "");
		let	ret = await this.getGoogleApi().firestore_createDocument(path, _realData, documentId);
		let	statusCode = ObjUtils.GetValueToInt(ret, "statusCode");
		if (statusCode == 200)
		{
			documentId = ObjUtils.GetValue(ret, "document_id", "");
			if (_returnId == true)
				return documentId;
			else
			{
				_realData["id"] = documentId;
				return _realData;
			}
		}
		else
		{
			if (_returnId == true)
				return "";
			else
				return null;
		}
	}

	async	createDb(_realData)
	{
		// FIRESTORE?
		if (this.isFirestore() == true)
		{
			// insert it
			return await this.queryInsertFirestore(_realData, false);
		}
		// PGSQL
		else
		{
			// insert it and get the new ID
			let	idCreated = await this.queryInsert(_realData, true);

			// if we have it, we read the object
			if (idCreated > 0)
			{
				// create the filter for it
				let	newFilter = {"id": idCreated};
				return await this.read(newFilter);
			}
			else
				return null;
		}
	}





	async	updateDb(_filters, _data, _addUpdatedAt = false)
	{
		// FIRESTORE?
		if (this.isFirestore() == true)
		{
			// updated at
			let	updatedAtField = this.getFieldUpdatedAt();
			if ( (updatedAtField != "") && (_addUpdatedAt == true) )
				_data[updatedAtField] = DateUtils.NowToZulu();

			// get the path and object id
			let	pathAndId = this.getFirestorePathAndIdToObject(_filters);

			// update it
			let	statusCode = await this.getGoogleApi().firestore_patch(pathAndId.path, _data, pathAndId.id);
			return statusCode == 200;
		}
		// PGSQL
		else
		{
			// set the condition based on ID or code
			let	conditions = this.getConditionForIdOrCode(_filters);
			if (conditions.length == 0)
				return null;

			// run the update
			return await this.queryUpdate(_data, conditions, _addUpdatedAt);
		}
	}



	async	postUpdate(_filters, _data, _updatedData)
	{

	}

	async	deleteDb(_filters)
	{
		// FIRESTORE?
		if (this.isFirestore() == true)
		{
			// get the path and object id
			let	pathAndId = this.getFirestorePathAndIdToObject(_filters);

			// delete
			let	statusCode = await this.getGoogleApi().firestore_delete(pathAndId.path, pathAndId.id);
			return statusCode == 200;			
		}
		// PGSQL
		else
		{
			// set the condition based on ID or code
			let	conditions = this.getConditionForIdOrCode(_filters);
			if (conditions.length == 0)
				return false;

			// execute
			return await this.queryDelete(conditions);			
		}
	}



	async	postDeleteProcessing(_filters)
	{
		
	}

	async	preDeleteProcessing(_filters)
	{
		
	}

	async	getValue(_field, _recordId, _default = "", _fieldId = "id", _table = "")
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return _default;

		// set the table
		if (StringUtils.IsEmpty(_table) == true)
			_table = this.__table;
		
		return await dbMgr.getValue(_table, _field, _recordId, _default, _fieldId);
	}

	getConditionForIdOrCode(_filters, _otherIdIfCode = "")
	{
		let conditions = [];

		// id?
		if (ObjUtils.HasProperty(_filters, "id") == true)
			conditions.push(this.field('id') + "=$" + _filters["id"]);
		// code?
		else if (ObjUtils.HasProperty(_filters, "code") == true)
		{
			conditions.push(this.field('code') + "=$" + _filters["code"]);

			// it's code, do we need to add another condition with an id?
			if (StringUtils.IsEmpty(_otherIdIfCode) == false)
			{
				conditions.push(this.field(_otherIdIfCode) + "=$" + _filters[_otherIdIfCode]);
			}
		}
		else
		{
			this.logError("No id or code in filters", _filters);
		}

		return conditions;
	}

	field(_field, _alias="", _function="")
	{
		if (this.isFirestore() == true)
			return _field;
		else
			return PGDBMgr.Field(this.__table, _field, _alias, _function);
	}

	conditionTimestamp(_field, _dateStr, _comparison = "=")
	{
		return PGDBMgr.ConditionTimestamp(_field, _dateStr, _comparison);
	}

	async	max(_field)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return 0;

		return await dbMgr.max(this.getMainTable(), _field);
	}

	async 	count(_field, _id, _fieldId = "id")
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return 0;

		return await dbMgr.count(this.getMainTable(), _field, _id, _fieldId);
	}

	async 	countFromConditions(_field, _conditions)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return 0;

		return await dbMgr.countFromConditions(this.getMainTable(), _field, _conditions);
	}

	async	getValue(_field, _id, _default = "", _fieldId = "id")
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return _default;

		return await dbMgr.getValue(this.getMainTable(), _field, _id, _default, _fieldId);
	}

	async	firestoreGetFirst(_path, _orderBy = [])
	{
		let	items = await this.firestoreList(_path, _orderBy, 1);
		if (ArrayUtils.IsEmpty(items) == true)
			return null;
		else
			return items[0];		
	}

	async	firestoreList(_path, _orderBy = [], _limit = 0)
	{
		// get it
		let	ret = await this.getGoogleApi().firestore_list(_path, _orderBy, _limit);

		// return the objects
		return ObjUtils.GetValue(ret, "documents", []);
	}

	async	firestoreListBatch(_paths)
	{
		// get it
		let	ret = await this.getGoogleApi().firestore_batchGet(_paths);

		// return the objects
		return ObjUtils.GetValue(ret, "documents", []);		
	}

	async	queryFromConditionsToRow(_tables, _conditions, _fields = [], _orderBy = [], _rowIndex=0, _groupBy = [])
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return null;

		// execute
		let	result = await dbMgr.queryFromConditionsToRow(_tables, _conditions, _fields, _orderBy, _rowIndex, _groupBy);

		return result;			
	}

	async	queryFromConditionsToList(_tables, _conditions, _fields = [], _orderBy = [], _limit = -1, _groupBy = [], _offset = 0)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return [];

		// execute
		let	result = await dbMgr.queryFromConditionsToList(_tables, _conditions, _fields, _orderBy, _limit, _groupBy, _offset);

		return result;
	}

	async	queryInsert(_data, _returnId = false, _table = "", _appendNewId = true)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
		{
			if (_returnId == true)
				return 0;
			else
				return null;
		}

		// empty table? we use ours
		if (StringUtils.IsEmpty(_table) == true)
			_table = this.__table;

		// insert it and get the new ID
		let	newObjectId = await dbMgr.insert(_table, _data, _returnId);

		// depending on if we are returning the id or not
		if (_returnId == false)
		{
			if (newObjectId == false)
				return null;

			// set it
			if (_appendNewId == true)
				_data['id'] = newObjectId;

			return _data;		
		}
		else
			return newObjectId;
	}

	async	queryInsertBatch(_rows, _table = "")
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return null;

		// empty table? we use ours
		if (StringUtils.IsEmpty(_table) == true)
			_table = this.__table;

		// insert it and get the new ID
		return await dbMgr.insertBatch(_table, _rows);
	}

	getFieldUpdatedAt()
	{
		return "updated_at";
	}

	async	queryUpdate(_data, _conditions, _addUpdatedAt=true)
	{
		// make sure to add the updated at
		let	updatedAtField = this.getFieldUpdatedAt();
		if ( (updatedAtField != "") && (_addUpdatedAt == true) )
			_data[updatedAtField] = "NOW()";

		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return false;

		let	result = await dbMgr.update(this.__table, _data, _conditions);

		return result;
	}

	async	incrementCounter(_id, _field, _value, _fieldId = "id")
	{
		if ( (_id <= 0) || (_value == 0) )
			return;

		// condition based on ID
		let conditions = [
			this.field(_fieldId)  + '=$' + _id
		];

		// build the data
		let	data = {};
		if (_value >= 0)
			data[_field] = _field + ' + ' + _value;
		else
		{
			data[_field] = _field + ' - ' + (-_value);

			// add condition to be above the value
			conditions.push(_field + " >= " + (-_value));
		}

		this.queryUpdate(data, conditions, false);
	}

	async	incrementCounterInIds(_ids, _field, _value, _fieldId = "id")
	{
		if ( (ArrayUtils.IsEmpty(_ids) == true) || (_value == 0) )
			return;

		// condition based on ID
		let conditions = [
			this.field(_fieldId)  + 'IN$' + _ids.join(" | ")
		];

		// build the data
		let	data = {};
		if (_value >= 0)
			data[_field] = _field + ' + ' + _value;
		else
		{
			data[_field] = _field + ' - ' + (-_value);

			// add condition to be above the value
			conditions.push(_field + " >= " + (-_value));
		}

		this.queryUpdate(data, conditions, false);
	}

	async	queryDelete(_conditions, _table = "")
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return false;

		// empty table? we use ours
		if (StringUtils.IsEmpty(_table) == true)
			_table = this.__table;

		let	result = await dbMgr.delete(_table, _conditions);

		return result;
	}

	async	queryToList(_queryObj)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return [];

		return await dbMgr.queryToList(_queryObj);
	}

	async	queryToRow(_queryObj, _rowIndex=0)
	{
		// get the database
		let	dbMgr = this.getDBMgr();
		if (dbMgr == null)
			return [];

		return await dbMgr.queryToRow(_queryObj, _rowIndex);			
	}

	async	pushEvent(_eventType, _payload, _sendRemotely = true)
	{
		// pass the event to the service
		await this.getService().pushEvent(this.getModelCode(), _eventType, _payload, _sendRemotely);
	}

	async	onPubSubEvent(_event)
	{
		// override this to add specific things to do when receiving a pub sub event
		await this.onEvent(_event);
	}

	async	onEvent(_event)
	{
		// override this method to do specific action when an event is triggered (from subscription)
	}



	firestoreBatch_init()
	{
		return GoogleAPI.Firestore_Batch_Init();
	}

	async	firestoreBatch_create(_batchInfo, _filters, _data)
	{
		// clean up the data
		let	realData = await this.prepareDataForCreate(_filters, _data);
		if (realData == null)
			return _batchInfo;

		// get the path
		let	path = this.getFirestorePath(_filters);
		if (StringUtils.IsEmpty(path) == false)
		{
			// get the document id
			let	documentId = ObjUtils.GetValue(realData, "id", "");

			// add it
			_batchInfo = GoogleAPI.Firestore_Batch_Create(_batchInfo, path, realData, documentId);
		}
		else
		{
			this.logError("Couldnt create batch because path is empty!", {
				batch: _batchInfo,
				filters: _filters,
				data: _data
			});
		}

		return _batchInfo;
	}

	async	firestoreBatch_update(_batchInfo, _filters, _data, _addUpdatedAt = false)
	{
		// updated at
		let	updatedAtField = this.getFieldUpdatedAt();
		if ( (updatedAtField != "") && (_addUpdatedAt == true) )
			_data[updatedAtField] = DateUtils.NowToZulu();
	
		// get the path and object id
		let	pathAndId = this.getFirestorePathAndIdToObject(_filters);
		if (StringUtils.IsEmpty(pathAndId.path) == false)
		{
			// add it
			_batchInfo = GoogleAPI.Firestore_Batch_Update(_batchInfo, pathAndId.path, _data, pathAndId.id);
		}
		else
		{
			this.logError("Couldnt update batch because path is empty!", {
				batch: _batchInfo,
				filters: _filters,
				data: _data
			});
		}

		return _batchInfo;
	}

	async	firestoreBatch_delete(_batchInfo, _filters)
	{
		// get the path and object id
		let	pathAndId = this.getFirestorePathAndIdToObject(_filters);
		if (StringUtils.IsEmpty(pathAndId.path) == false)
		{
			// add it
			_batchInfo = GoogleAPI.Firestore_Batch_Delete(_batchInfo, pathAndId.path, pathAndId.id);
		}
		else
		{
			this.logError("Couldnt delete batch because path is empty!", {
				batch: _batchInfo,
				filters: _filters,
			});
		}

		return _batchInfo;
	}

	async	firestoreBatch_run(_batchInfo)
	{
		let	statusCode = await this.getGoogleApi().firestore_batchWrite(_batchInfo);
		return statusCode == 200;
	}

	async	populate(_list, _type, _fieldId, _fieldTarget)
	{
		// build the list of ids
		let	ids = ObjUtils.GetValueRecursive(_list, _fieldId);

		// get them
		if (ids.length > 0)
		{
			// get them
			let	infoDict = await this.doOnModel(_type, AbstractModel.ACTION_LIST_BATCH, {}, {ids: ids});

			// replace them
			_list = ObjUtils.ReplaceValueRecursive(_list, _fieldId, infoDict, _fieldTarget, null, -1);
		}

		return _list;
	}	
}

module.exports = {
	AbstractModel
};