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
							"description": "Returns an object",
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


					/*************************
					 * 
					 *	/test/endpoint/list/:user_id
					*
					*************************/
					"/test/endpoint/list/:user_id": [
						{
							"action": "list",
							"summary": "List objects",
							"description": "Returns a list of objects",
							"parameters": [
								{
									"name": "user_id",
									"description": "User id to filter",
									"in": "path",
									"required": true,
									"schema": {
										"type": "integer",
										"format": "int32"
									}
								},
								{
									"name": "order_by",
									"description": "Option to order by",
									"in": "query",
									"required": false,
									"schema": {
										"type": "string"
									}
								},
								{
									"name": "limit",
									"description": "Page size for pagination",
									"in": "query",
									"required": false,
									"schema": {
										"type": "integer",
										"format": "int32"
									}
								},
								{
									"name": "offset",
									"description": "Offset for pagination",
									"in": "query",
									"required": false,
									"schema": {
										"type": "integer",
										"format": "int32"
									}
								},
							],
							"response": {
								"description": "List of object",
								"schema": {
									"type": "array",
									"items": {
										"$ref": "#/components/schemas/TestModelStructure"
									}
								}
							}
						},
					],					
				}
			}
			
		}
	}
};