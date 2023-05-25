class	AbstractModelMgr
{
	constructor(_container)
	{
		this.__container = _container;

		// models
		this.__models = {};
	}

	getModel(_type)
	{
		if (this.__models.hasOwnProperty(_type) == false)
			this.__models[_type] = this.createModel(_type, this.__container);
		return this.__models[_type];
	}

	createModel(_type, _container)
	{
		throw new Error("Abstract Method has no implementation");
	}

	createAllModels()
	{
		// get the list of models
		let	models = this.getAllModelCodes();
		for(let i=0; i<models.length; i++)
		{
			// create it
			this.createModel(models[i], this.__container);
		}
	}

	getAllModelCodes()
	{
		return [];
	}
}

module.exports = {
	AbstractModelMgr
};