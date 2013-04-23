/*globals require module console __dirname setTimeout*/
var express = require('express'),
    csv = require('csv'),
    busfetcher = require('./busfetcher'),
    GTFS = require("./gtfs");
var app;

var gtfs = null;

var sfab_clients = {};

var acequiaServer = null;

var feedURI = "http://www.gtfs-data-exchange.com/agency/santa-fe-trails/feed";
var latitude = 35.6660;
var longitude = -105.9632;

var getBusLocations = function() {
    busfetcher.fetchBusLocations(function(res) {
        app.lastBusLocations = res;
        console.log("Received bus locations.");
        // broadcast bus locations
        acequiaServer.send("","busLocations",res);
    });
}

var onGetBusLocations = function(message) {
    acequiaServer.send("","busLocations",app.lastBusLocations,message.from);
}

var onGetVersion = function (message) {
    var response = {
        version: gtfs.getVersion(),
        agency: gtfs.getAgency(),
        latitude: latitude,
        longitude: longitude
    };

    acequiaServer.send("", "version", response, message.from);    
};

var onGetRoutes = function (message) {
    acequiaServer.send("", "routes", gtfs.getRoutes(), message.from);
};

var onGetRoute = function (message) {
    acequiaServer.send("", "route", gtfs.getRouteById(message.body[0].route_id), message.from);
};

var onGetStops = function (message) {
    acequiaServer.send("", "stops", gtfs.getStopsDict(), message.from);
};

var onRefresh = function (message) {
    gtfs = GTFS.createGeneralTransitFeed(feedURI, null);    
};

var startHTTPServer = function () {
    app = express();
    
    app.get('/', function (req, res) {
        res.redirect('/mo');
    });

    // Configuration
    app.configure(function () {
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(express["static"](__dirname + '/public'));
        app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    });

    var http = require('http'),
        server = http.createServer(app);

    server.listen(3000);

    acequiaServer = require("acequia").createServer({
        express_app: app
        , httpServer: server
        , oscPort: false
        , tcpPort: false
        , datastore: false 
        , minify_client: false
    });
    acequiaServer.on("refresh", onRefresh);    
    acequiaServer.on("getRoutes", onGetRoutes);
    acequiaServer.on("getRoute", onGetRoute);
    acequiaServer.on("getStops", onGetStops);    
    acequiaServer.on("getVersion", onGetVersion);
    acequiaServer.on("getBusLocations", onGetBusLocations);
    acequiaServer.start();

    setInterval(getBusLocations, 15000);
};

var START = function () {
    var args = process.argv.splice(2),
        index = 0;

    while (index < args.length) {
        switch (args[index]) {
        case "--feed":
            index += 1;
            feedURI = args[index];
            break;
            
        case "--lat":
            index += 1;
            latitude = parseFloat(args[index]);
            break;
            
        case "--lon":
            index += 1;
            longitude = parseFloat(args[index]);
            break;

        default:
            console.error("Unknown command line argument");
            break;
        }
        index += 1;
    }
        
    gtfs = GTFS.createGeneralTransitFeed(feedURI, startHTTPServer);    
};

var start = function () {
    setTimeout(START, 2);
};

start();