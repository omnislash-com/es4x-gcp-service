import { AbstractServiceContext } from '../src/service/AbstractServiceContext';


class	TestContext	extends	AbstractServiceContext
{
	constructor(_vertx, _env, _isAdmin = false)
	{
		super(_vertx, _env, _isAdmin);
	}

	getServicesHostConfig(_env)
	{
		return {
			"test_service": "localhost"
		};
	}		
}

module.exports = {
	TestContext
};