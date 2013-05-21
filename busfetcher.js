var http = require('http'),
	util = require('util'),
	parseString = require('xml2js').parseString;

var debug = false;

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

		if (debug) console.log(res.headers);
		// set JSESSIONID cookie
		options.headers.Cookie = res.headers["set-cookie"][0];
		options.path = "/portal/fr/LoginPage.do";
		http.request(options, function(res) {
		
			if (debug) console.log(res.headers);
			// fetch bus locations
			// options.path = "/portal/fr/FRVehicleLocationServlet.txt?r="+Math.random();
			options.path = "/portal/frfeed/query/santafe/Vehicle";
			http.request(options, function(res) {
				
				var vehicleInfo = "";

				res.on('data', function(chunk) {
					vehicleInfo += chunk;
				});

				res.on('end', function () {
					console.log('It\'s over.');
					if (debug) console.log(vehicleInfo);
					callback && callback(JSON.parse(vehicleInfo));
					// parseString(xmlStr, function (err, result) {
					// 	console.log(util.inspect(result, null));
					//     // var result = result["FRDATA"]["VEHICLELOCATIONS"][0]["VEHICLELOCATION"];
					//     // callback && callback(result);
					// });
				});

			}).end();

		}).end();

	}).end();
}