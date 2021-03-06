/*globals require module console __dirname*/

var path = require('path');
var http = require('http');
var url = require("url");
var csv = require('csv');
var fs = require('fs');
var FeedParser = require('feedparser');

var gis = require("./gis");
var utils = require("./utils");

var arrayToDict = function (arr) {
    var i, ret = {};
    for (i = 0; i < arr.length; i += 1) {
        ret[arr[i].id] = arr[i];
    }
    return ret;
};

var GTFSReader = function (uri, gtfsobj) {
    this.gtfsobj = gtfsobj;
    this.version = "";
    
    var parser = new FeedParser();
    // parser.parseUrl(uri, utils.objCallback(this, "onfeed"));
    this.gtfsobj.parseFeedFiles();
};

GTFSReader.prototype.onfeed = function (error, meta, articles) {
    var start, end, file_url, file;
    if (error) {
        console.error(error);
    } else {
        start    = articles[0].description.indexOf("href=") + 6;
        end      =  articles[0].description.indexOf('"', start);
        file_url = articles[0].description.substring(start, end);
        
        this.version = file_url;
        
        file = this.gtfsobj.dataDir + url.parse(file_url).pathname.split('/').pop();
        if (path.existsSync(file)) {
            this.gtfsobj.parseFeedFiles();
        } else {
            this.getGTFSFiles(file_url, this);
        }
    }
};

// Function to download file using HTTP.get
GTFSReader.prototype.getGTFSFiles = function (file_url, self) {
    var options, file_name, file;
    
    options = {
        host: url.parse(file_url).host,
        port: 80,
        path: url.parse(file_url).pathname
    };

    file_name = this.gtfsobj.dataDir + url.parse(file_url).pathname.split('/').pop();
    file = fs.createWriteStream(file_name, 
        { flags: 'w',
          encoding: "binary",
          mode: 0755 }
    );

    http.get(options, function (res) {
        res.on('data', function (data) {
                file.write(data);
            }).on('end', function () {
                file.end();
                self.unzipFeedFiles(file_name);
            });
    });
};

// GTFSReader.prototype.unzipFeedFiles = function (file_name) {
//     var uncompressed, zipfile, dirname, zf, fd, i, name, buffer;
//     zipfile = require('zipfile');
//     zf = new zipfile.ZipFile(file_name);
//     console.log(zf);
//     for (i = 0; i < zf.names.length; i += 1) {
//         name = zf.names[i];
//         uncompressed = path.join(this.gtfsobj.dataDir, name);
        
//         if (path.extname(name)) {
//             buffer = zf.readFileSync(name);
//             fd = fs.openSync(uncompressed, 'w');
//             console.log('unzipping: ' + name);
//             fs.writeSync(fd, buffer, 0, buffer.length, null);
//             fs.closeSync(fd);
//         }
//     }

//     this.gtfsobj.parseFeedFiles();
// };


var GeneralTransitFeed = function (uri, callback) {
    this.dataset = {};
    
    this.version = "";
    
    this.feedFiles = ['agency', 'calendar', 'calendar_dates', 'fare_attributes',
                      'fare_rules', 'feed_info', 'frequencies', 'routes', 'shapes', 
                      'stops', 'stop_times', 'transfers', 'trips'];
    
    this.callback = callback;
    this.dataDir = __dirname + "/data/";
    utils.mkdirp(this.dataDir, 0755);
    
    this.gtfsReader = new GTFSReader(uri, this);
};

GeneralTransitFeed.prototype.getVersion = function () {
    return this.gtfsReader.version;
};

GeneralTransitFeed.prototype.getAgency = function () {
    return this.dataset.agency[0];
};

GeneralTransitFeed.prototype.getCalendars = function () {
    return this.dataset.calendar;
};

GeneralTransitFeed.prototype.getRoutes = function (routesOnly) {
    return this.dataset.routes;
};

GeneralTransitFeed.prototype.getShapes = function () {
    return this.dataset.shapes;
};

GeneralTransitFeed.prototype.getStops = function () {
    return this.dataset.stops;
};

GeneralTransitFeed.prototype.getStopsDict = function () {
    if (typeof(this.stopsDict) === "undefined") {
        this.stopsDict = arrayToDict(this.dataset.stops);
    }
    return this.stopsDict;
};

GeneralTransitFeed.prototype.getStopTimes = function () {
    return this.dataset.stop_times;
};

GeneralTransitFeed.prototype.getTrips = function () {
    return this.dataset.trips;
};

GeneralTransitFeed.prototype.getRouteById = function (id) {
    var ret = null, route = null, i;
    for (i = 0; i < this.dataset.routes.length; i += 1) {        
        if (this.dataset.routes[i].id === id) { 
            route = this.dataset.routes[i];
            break;
        }   
    }
    
    if (route) {
        ret = {};
        utils.clone(route, ret);
        ret.trips = this.getTripsForRoute(ret.id);
    }
    return ret;
};
        
GeneralTransitFeed.prototype.getTripById = function (id) {
    var ret = null, trip = null, i;
    for (i = 0; i < this.dataset.trips.length; i += 1) {      
        if (this.dataset.trips[i].id === id) {
            trip = this.dataset.trips[i];
            break;
        }
    }

    if (trip) {
        ret = {};
        utils.clone(trip, ret);
        ret.stop_times = this.getStopTimesForTrip(ret.id);
    }
    return ret;
};

GeneralTransitFeed.prototype.getTripsForRoute = function (route_id) {
    var trip, trip_ids = [], trips = [], i;
    for (trip in this.dataset.trips) {      
        if (this.dataset.trips[trip].route_id === route_id) {
            trip_ids.push(this.dataset.trips[trip].id);
        }
    }
    
    for (i = 0; i < trip_ids.length; i += 1) {
        trips.push(this.getTripById(trip_ids[i]));
    }
    return trips;
};

GeneralTransitFeed.prototype.getTripForRoute = function (route_id) {
    return this.getTripsForRoute(route_id)[0];
};

GeneralTransitFeed.prototype.getShapesById = function (id) {
    var ret = [], i;
    for (i in this.dataset.shapes) {
        if (this.dataset.shapes[i].shape_id === id) {
            ret.push(this.dataset.shapes[i]);
        }
    }
    return ret;
};

GeneralTransitFeed.prototype.getCalendarById = function (id) {
    var cal;
    for (cal in this.dataset.calendar) {
        if (this.dataset.calendar[cal].service_id === id) {
            return this.dataset.calendar[cal];
        } 
    }
    return null;
};

GeneralTransitFeed.prototype.getStopById = function (id) {
    var stop;
    for (stop in this.dataset.stops) {
        if (this.dataset.stops[stop].id === id) {
            return this.dataset.stops[stop];
        } 
    }
    return null;
};

GeneralTransitFeed.prototype.getStopTimeById = function (trip_id, stop_id) {
    var stop_time = null, ret = null, i;
    for (i = 0; i < this.dataset.stop_times.length; i += 1) {
        if (this.dataset.stop_times[i].trip_id === trip_id && 
            this.dataset.stop_times[i].stop_id === stop_id) {
            stop_time = this.dataset.stop_times[i];
            break;
        } 
    }
    
    if (stop_time) {
        ret = {};
        utils.clone(stop_time, ret);
    }
    return ret;
};

GeneralTransitFeed.prototype.getNearestStop = function (lat, lon) {
    var stops, distance, d, stop_pt, pt, nearestStop, i;
    
    distance = 12.0;
    pt = gis.createPoint(lat, lon);
    stops = this.getStops();
    
    for (i = 0; i < stops.length; i += 1) {
        stop_pt = gis.createPoint(stops[i].lat, stops[i].lon);
        d = gis.distanceBetweenTwoPoints(pt, stop_pt);
        if (d < distance) {
            distance = d;
            nearestStop = stops[i];
        }
    }
    
    return nearestStop;
};

GeneralTransitFeed.prototype.getNextArrivalsForStop = function (route_id, stop_id, time) {
    var i, j, trips, stop_time, ret = [], arrival_time, service_id;
    
    if (typeof(time) === "undefined") {
        time = new Date();
    }
    
    if (time.getDay() === 0) {
        service_id = "SU";
    } else if (time.getDay() === 6) {
        service_id = "SA";
    } else {
        service_id = "WD";
    }
    
    trips = this.getTripsForRoute(route_id);
    
    for (i = 0; i < trips.length; i += 1) {
        if (service_id !== trips[i].service_id) {
            continue;
        }
        for (j = 0; j < trips[i].stop_times.length; j += 1) {
            stop_time = trips[i].stop_times[j];
            if (stop_time.stop_id === stop_id) {
                arrival_time = utils.dateFromTimeString(stop_time.arrival_time);
                if (arrival_time > time) {
                    ret.push(stop_time);
                }
            }
        }
    }
    
    return ret;
};


GeneralTransitFeed.prototype.getStopTimesForTrip = function (trip_id) {
    var stop_time, stop_times = [], ids = [], i;
    for (stop_time in this.dataset.stop_times) {
        if (this.dataset.stop_times[stop_time].trip_id === trip_id) {
            ids.push(this.dataset.stop_times[stop_time].stop_id);
        } 
    }
    
    for (i = 0; i < ids.length; i += 1) {
        stop_times.push(this.getStopTimeById(trip_id, ids[i]));
    }
    return stop_times;
};

GeneralTransitFeed.prototype.parseFeedFiles = function () {
    
    var loadFeed = (function (self) {
        return function (id) {
            return self.load(id, self.callback, self);
        };
    }(this));
    
    this.feedFiles.forEach(function (id) {
        loadFeed(id);
    });
};

GeneralTransitFeed.prototype.load = function (feed, cb, self) {
    var out = [], stats,
    feedFile = this.dataDir + feed + ".txt",
    feedString = ((feed.charAt(feed.length - 1) === "s") ? feed.slice(0, -1) : feed) + "_";

    try {
        // Call stat to see if the file exists.  If it doesn't, it will throw
        // an exception and we will set the collection associated with this feed to empty
        stats = fs.lstatSync(feedFile);

        csv()
        .from.path(feedFile, {
            columns: true,
            trim: true
        })
        .transform(function (data, index) {
            var ret = {}, column, c, pos;
            for (c in data) {
                pos = c.indexOf(feedString);
                
                column = (pos === 0) ? c.substring(pos + feedString.length) : c;
                ret[column] = data[c];
            }
            return ret;
        })
        .on('record', function (data, index) {
            out.push(data);
        })
        .on('end', function (count) {
            console.log(feed + ':  number of lines: ' + count);
            // console.log("out",out);
            self.dataset[feed] = out;
            self.checkLoad(cb);
        })
        .on('error', function (error) {
            console.log(error.message);
        });
    } catch (e) {
        self.dataset[feed] = out;
        self.checkLoad(cb);
        console.log(feed + ':  number of lines: ' + self.dataset[feed].length);
        if (e.code !== "ENOENT") {
            console.log("uncaught exception reading " + feed + ":  " + e.message);
        }
    }
};

GeneralTransitFeed.prototype.checkLoad = function (callback) {
    var i, isDone = true;
    for (i = 0; i < this.feedFiles.length; i += 1) {
        if (!(this.feedFiles[i] in this.dataset)) {
            isDone = false;
            break;
        }
    }

    if (isDone) {
        if (callback) {
            callback();
        }
    }
};

module.exports.createGeneralTransitFeed = function (uri, callback) {
    return new GeneralTransitFeed(uri, callback);
};
