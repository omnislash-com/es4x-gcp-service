module.exports = {

	/*************************
	 * 
	 *		TEST SERVICE
	 *
	*************************/
	"test_service": {
		"name": "This is a test service",
		"description": "This service is just a test.",
		"version": "0.0.1",
		"author": {
			"email": "michael@omnislash.com",
			"name": "Mike",
			"url": ""
		},
		"models": {

			/*************************
			 * 
			 *	TEST SERVICE . TEST MODEL
			 *
			*************************/
			"test_model": {
				"sdk": {
					"name": "TestModel"
				},
				"schemas": {
					"TestModelStructure": {
						"type": "object",
						"properties": {
							"id": {
								"type": "int"
							}
						}
					}
				},
				"endpoints": {

					/*************************
					 * 
					 *	/test/endpoint/:id
					*
					*************************/
					"/test/endpoint/:id": [
						{
							"action": "read",
							"summary": "Reads an entry",
							"description": "Returns a list of game activity",
							"parameters": [
								{
									"name": "id",
									"description": "Id of the object",
									"in": "path",
									"required": true,
									"schema": {
										"type": "integer",
										"format": "int32"
									}
								}	
							],
							"response": {
								"description": "Test object",
								"schema": {
									"$ref": "#/components/schemas/TestModelStructure"
								}
							}
						},
					],

				}
			}
			
		}
	}
};