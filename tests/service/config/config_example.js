module.exports = {
	"databases": {
		"default": {
			"host": "0.0.0.0",
			"port": 5432,
			"user": "dbuser",
			"password": "dbpass",
			"name": "dbname",
		}
	},
	"cache": {
		'activated': true,
		'url': 'redis://:user@0.0.0.0:6379/1'
	},
	"gcp": {
		"region": "",
		"key": {
			"type": "service_account",
			"project_id": "",
			"private_key_id": "",
			"private_key": "",
			"client_email": "",
			"client_id": "",
			"auth_uri": "https://accounts.google.com/o/oauth2/auth",
			"token_uri": "https://oauth2.googleapis.com/token",
			"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
			"client_x509_cert_url": ""
		}	
	}
};
