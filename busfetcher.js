var http = require('http'),
	util = require('util'),
	parseString = require('xml2js').parseString;

exports.fetchBusLocations = function(callback) {
	var options = {
		hostname: "santafetrails.routematch.com",
		port: 52020,
		headers: {
			"Accept":"*/*",
			"Accept-Encoding":"gzip,deflate,sdch",
			"Accept-Language":"en-US,en;q=0.8",
			"Connection": "keep-alive",
			"Host": "santafetrails.routematch.com:52020",
			"Referer": "http://santafetrails.routematch.com:52020/portal/fr/index.jsp",
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.56 Safari/537.36"
		}
	}

	// login
	options.path = "/portal/frwp/santafe";
	http.request(options, function(res) {

		// set JSESSIONID cookie
		options.headers.Cookie = res.headers["set-cookie"][0];
		options.path = "/portal/fr/LoginPage.do";
		http.request(options, function(res) {
		
			// fetch bus locations
			options.path = "/portal/fr/FRVehicleLocationServlet.txt?r="+Math.random();
			http.request(options, function(res) {
				
				var xmlStr = "";

				res.on('data', function(chunk) {
					xmlStr += chunk;
				});

				res.on('end', function () {
					console.log('It\'s over.');
					parseString(xmlStr, function (err, result) {
					    var result = result["FRDATA"]["VEHICLELOCATIONS"][0]["VEHICLELOCATION"];
					    callback && callback(result);
					});
				});

			}).end();

		}).end();

	}).end();
}