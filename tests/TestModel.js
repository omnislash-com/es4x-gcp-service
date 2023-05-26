import { AbstractModel } from '../src/model/AbstractModel';


class	TestModel	extends	AbstractModel
{
	constructor(_service, _config)
	{
		super(_service, _config);

		console.log("we created model: " + this.getModelCode());
	}
}

module.exports = TestModel;