const { ObjUtils } = require("es4x-utils/src/utils/ObjUtils");
const { StringUtils } = require("es4x-utils/src/utils/StringUtils");

class	ModelMgr
{
	constructor(_service)
	{
		this.__service = _service;

		// models
		this.__models = {};
	}

	getModel(_type)
	{
		if (this.__models.hasOwnProperty(_type) == true)
			return this.__models[_type];
		else
			return null;
	}

	createModel(_config, _modelFolder)
	{
		// import the model
		let	classFile = ObjUtils.GetValueToString(_config, "file");
		if (StringUtils.IsEmpty(classFile) == false)
		{
			// import the source code
			let	modelClass = require(_modelFolder + classFile);

			// now create an instance of it
			let	modelInstance = new modelClass(this.__service, _config);

			// is it valid?
			if (modelInstance.isValid() == true)
			{
				// get the code
				let	code = modelInstance.getModelCode();

				// add it
				this.__models[code] = modelInstance;
			}
		}
	}

	createAllModels(_modelsConfig, _modelFolder)
	{
		// for each model in the configuration
		for(let config of _modelsConfig)
		{
			this.createModel(config, _modelFolder);
		}

		return this.__models.length > 0;
	}

	getAllModelCodes()
	{
		let	codes = [];
		for(let model in this.__models)
		{
			codes.push(model);
		}
		return codes;
	}
}

module.exports = {
	ModelMgr
};