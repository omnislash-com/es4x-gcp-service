module.exports = {
	"service": "test_service",
	"models": [
		{
			"model": "test_model",
			"file": "TestModel",
			"datasource": "pgsql",
			"table": "game_player",
			"firestore_path": "",
			"can_update": false,
			"can_delete": false,
			"order_by_options": [
				"column",
				"-column"
			],
			"pagination": {
				"active": true,
				"default_page_size": 20
			}
		}
	]
};
