/**
 *  AutobusClient
 *
 *  Created by Peter R. G. Small on 2012-05-07.
 *  (c) 2013 RedfishGroup, LLC and CityKnowledge LLC
 */

/*global $ document google navigator AcequiaClient MapIconMaker setTimeout localStorage
CJSON console*/

var objCallback = function (obj, func) {
    return function () {
        obj[func].apply(obj, arguments);
    };
};


/**
 * Constructor for AutobusClient
 */
var AutobusClient = function () {
    this.map = null;

    this.mapBounds = null;
    
    this.agency = null;
    
    this.routes = {};
    
    this.stops = {};
    
    this.routePaths = {};
    
    this.markers = {};
    
    this.buses = [];

    this.direction = "inbound";
    this.travelMode = "bike";
    
    this.currentPositionMarker = null;
    
    this.initialized = false;
    
    this.acequiaClient = null;
    
    this.allDataDownloaded = false;
};

AutobusClient.prototype.retrieve = function (key) {
    var  ret = localStorage.getItem(this.agency.id + key);
    if (ret !== null) {
        ret = CJSON.parse(ret);
    }
    return ret;
};

AutobusClient.prototype.persist = function (key, obj) {
    localStorage.setItem(this.agency.id + key, CJSON.stringify(obj));
};

AutobusClient.prototype.onStops = function (message) {
    this.stops = message.body[0];
    this.persist("stops", this.stops);
    this.acequiaClient.send("getRoutes");
};

AutobusClient.prototype.init = function (zoom, lat, lng, mapType, mapOptions) {
    if (this.initialized) {
        return;
    }

    this.initialized = true;
    
    // Initialize the map
    var options = $.extend({
        zoom: zoom,
        center: new google.maps.LatLng(lat, lng),
        mapTypeId: mapType
    }, mapOptions || {});
    this.map = new google.maps.Map(document.getElementById("map_canvas"), options);
    this.geocoder = new google.maps.Geocoder();
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: true,
        panel: document.getElementById("directions_panel")
    });
    this.destMarker = new google.maps.Marker();
    this.destWindow = new InfoBubble({
        padding: 10,
        borderRadius: 5,
        arrowSize: 15,
        arrowStyle: 0,
        arrowPosition: 50,
        maxWidth: 150,
        borderColor: "#ccc",
        backgroundColor: "#fff",
        disableAutoPan: true
    });

    var defaultRadius = 0.25*1609;
    this.proximities = { // used to determine which bus stops are worth drawing
        origin: new google.maps.Circle({ map: this.map, radius: defaultRadius, visible: false }),
        destination: new google.maps.Circle({ map: this.map, radius: defaultRadius, visible: false }),
        currentLocation: new google.maps.Circle({ map: this.map, radius: defaultRadius, visible: false })
    };

    this.initMarkers();

    // Set up the acequia client and connect to the server
    this.acequiaClient = new AcequiaClient("autobus_" + Math.random());
    this.acequiaClient.on("version", objCallback(this, "onVersion"));
    this.acequiaClient.on("routes", objCallback(this, "onRoutesMessage"));
    this.acequiaClient.on("route", objCallback(this, "onRouteMessage"));
    this.acequiaClient.on("stops", objCallback(this, "onStops"));
    this.acequiaClient.on("busLocations", objCallback(this, "onBusLocations"));
    this.acequiaClient.addConnectionChangeHandler(objCallback(this, "onConnected"));
    this.acequiaClient.connect();
    
    // Start getting position updates
    this.getCurrentPosition();
};

AutobusClient.prototype.initMarkers = function() {
    var scale = 0.8;
    this.emptyMarkerIcon = {
        url: "images/location_icon_empty.png",
        scaledSize: new google.maps.Size(25*scale,40*scale)
    };
    this.fullMarkerIcon = {
        url: "images/location_icon.png",
        scaledSize: new google.maps.Size(25*scale,40*scale)
    };
    this.markerIconBall = {
        url: "images/location_icon_ball.png",
        scaledSize: new google.maps.Size(25*scale,40*scale)
    };
    this.pseudoPosMarker = new google.maps.Marker({
        map: this.map,
        icon: this.markerIconBall,
        visible: false
    });
    this.currentPositionMarker = new google.maps.Marker({
        map: this.map,
        icon: this.fullMarkerIcon,
        zIndex: 500,
        visible: false
    });
}

AutobusClient.prototype.centerMapOnCurrentPositon = function () {
    this.map.setCenter(this.currentPositionMarker.getPosition());
};

AutobusClient.prototype.getCurrentPosition = function () {
    navigator.geolocation.getCurrentPosition(objCallback(this, "onPositionUpdate"));
};

// this event handler begins the chain of communication
AutobusClient.prototype.onConnected = function (connected) {
    if (connected) {
        this.acequiaClient.send("getVersion");
    }
};

AutobusClient.prototype.onVersion = function (message) {
    var version = message.body[0].version, ls, routes,
        agency  = message.body[0].agency;
        
    if (this.allDataDownloaded) {
        return;
    }

    this.agency = agency;

    if (this.retrieve("version") === version) {
        this.agency = this.retrieve("agency");
        routes = this.retrieve("routes");
        this.stops = this.retrieve("stops");
        this.onRoutes(routes);
    } else {
        localStorage.clear();
        this.persist("version", version);
        this.persist("agency", agency);
        this.acequiaClient.send("getStops");
    }

    this.fetchBusLocations();
    
    this.setAgencyInfo();
};

AutobusClient.prototype.fetchBusLocations = function() {
    if (this.acequiaClient.isConnected()) {
        this.acequiaClient.send("getBusLocations");
    }
}

AutobusClient.prototype.setAgencyInfo = function () {
    document.title = this.agency.name;
    $("#home-title").html(this.agency.name);
};

AutobusClient.prototype.onBusLocations = function (message) {
    var buses = message.body;
    var busIcon = {
        anchor: new google.maps.Point(10,10),
        url: "images/busIcon.png"
    };
    for (var i=0; i<buses.length; i++) {
        var busInfo = buses[i];
        var point = new google.maps.LatLng(parseFloat(busInfo.LAT[0]), parseFloat(busInfo.LON[0]));
        if (this.buses[i]) this.buses[i].setPosition(point);
        else this.buses.push(new google.maps.Marker({
            position: point,
            map: this.map,
            icon: busIcon
            // icon: MapIconMaker.createLabeledMarkerIcon({
            //     width: 20, height: 34, label: label, 
            //     primaryColor: rt.color, labelColor: rt.color
            // })
        }));
    }
}

// AutobusClient.prototype.onBusLocation = function (message) {
//     var busInfo = message.body[0], label, rt,
//         point   = new google.maps.LatLng(parseFloat(busInfo.lat), parseFloat(busInfo.lon));
    
//     if (!this.buses[busInfo.route_id]) {
//         rt = this.routes[busInfo.route_id];
//         label = rt.id + ": " + rt.desc;
//         this.buses[busInfo.route_id] = new google.maps.Marker({
//             position: point,
//             map: this.map,
//             title: label,
//             icon: MapIconMaker.createLabeledMarkerIcon({width: 20, height: 34, label: label, 
//                                                         primaryColor: rt.color, labelColor: rt.color})
//         });
//     } else {
//         this.buses[busInfo.route_id].setPosition(point);
//     }
// };

AutobusClient.prototype.centerMap = function (latlng, r) {
    r = r ? r * 1609.0 : 0.45 * 1609; // 1609 meters per mile
    latlng = latlng ? latlng : this.proximities.origin.getCenter();
    
    var bounds = new google.maps.Circle({ center: latlng, radius: r }).getBounds();
        
    // this.map.setCenter(latlng);
    // this.mapBounds = this.proximityCircle.getBounds();
    this.mapBounds = bounds;
    this.map.fitBounds(this.mapBounds);

    // updates markers
    google.maps.event.trigger(this.map, 'resize');
};

AutobusClient.prototype.onPositionUpdate = function (position) {
    var point = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
    
    if (!point.equals(this.currentPositionMarker.getPosition())) {
        this.proximities.currentLocation.setCenter(point);
        this.proximities.origin.setCenter(point);
        this.currentPositionMarker.setPosition(point);
        this.displayRelevantStops();
    }

    if (!this.currentPositionMarker.getVisible()) { // first time
        this.currentPositionMarker.setVisible(true);
        this.centerMap(point, 0.45);
    }
    
    setTimeout(objCallback(this, "getCurrentPosition"), 2000);
};

AutobusClient.prototype.onRoutesMessage = function (message) {
    this.persist("routes", message.body);
    this.onRoutes(message.body);
};

AutobusClient.prototype.onRoutes = function (message) {
    throw new Error("onRoutes NOT IMPLEMENTED");
};

AutobusClient.prototype.onRoute = function (route) {
    throw new Error("onRoute NOT IMPLEMENTED");
};

AutobusClient.prototype.onRouteMessage = function (message) {
    this.processRoute(message.body[0]);
};

AutobusClient.prototype.processRoute = function (route) {
    var trip;
    this.routes[route.id] = route;
    this.persist("route" + route.id, route);
    
    trip = this.getTripForRoute(route.id);
    // if (trip !== null) {
        this.onRoute(trip);
    // }    
};

AutobusClient.prototype.routeIdFromEleId = function (eleId) {
    var route_id = eleId;
    return route_id.substring(route_id.indexOf("_") + 1);
};

AutobusClient.prototype.getServiceId = function (time) {
    if (typeof(time) === "undefined") {
        time = new Date();
    }
    
    if (time.getDay() === 0) {
        return "SU";
    } else if (time.getDay() === 6) {
        return "SA";
    } else {
        return "WD";
    }
};

AutobusClient.prototype.dateFromTimeString = function (timeString) {
    var ret,
    dd = timeString.split(":"),
    hours = parseInt(dd[0], 10);

    ret = new Date();
    if (hours > 24) {
        hours = 24 - hours;
        ret.setDate(ret.getDate() + 1);
    }
    ret.setHours(hours);
    ret.setMinutes(parseInt(dd[1], 10));
    ret.setSeconds(parseInt(dd[2], 10));

    return ret;
};

AutobusClient.prototype.stopForStopId = function (route_id, stop_id) {
    return this.stops[stop_id];
};

AutobusClient.prototype.getAllStopsForRoute = function (route_id) {
    // Retrieve all of the stops for a route
    var inbound = [], outbound = [], service_id, trips, i, j, addToList, stop_id;
    
    addToList = function (list, stop) {
        for (var i = 0; i < list.length; i += 1) {
            if (list[i].id === stop.id) {
                return;
            }
        }
        list.push(stop);
    };
    service_id = this.getServiceId();
    
    trips = this.routes[route_id].trips;
    
    for (i = 0; i < trips.length; i += 1) {
        if (service_id !== trips[i].service_id) {
            continue;
        }
        for (j = 0; j < trips[i].stop_times.length; j += 1) {
            stop_id = trips[i].stop_times[j].stop_id;
            if (trips[i].direction_id === "0") {
                addToList(outbound, this.stops[stop_id]);
            } else {
                addToList(inbound, this.stops[stop_id]);
            }
        }
    }
    
    return {
        outbound: outbound, 
        inbound: inbound
    };
};

AutobusClient.prototype.getTripForRoute = function (route_id, direction_id) {
    var i, 
    route = this.routes[route_id], 
    service_id = this.getServiceId();
    
    if (typeof(direction_id) === "undefined") {
        direction_id = "0";
    }
    
    for (i = 0; i < route.trips.length; i += 1) {
        if (route.trips[i].service_id === service_id &&
            route.trips[i].direction_id === direction_id) {
            return route.trips[i];
        }
    }
    
    console.warn("No trip found for route: " + route_id + 
                 ", service_id: " + service_id + ", direction_id: " + direction_id);
    return null;
};

AutobusClient.prototype.getTripsForRoute = function (route_id) {
    return {
        outbound: this.getTripForRoute(route_id, "0"),
        inbound:  this.getTripForRoute(route_id, "1")
    };
};

AutobusClient.prototype.getNextArrivalsForStop = function (route_id, stop_id, time) {
    var i, j, k, trips = [], stop_time, times = [], headsigns = [], 
    arrival_time, service_id, direction_id, direction_ids = ["0", "1"];

    if (typeof(time) === "undefined") {
        time = new Date();
    }

    trips = this.routes[route_id].trips;
    service_id = this.getServiceId(time);

    for (k = 0; k < direction_ids.length; k += 1) {
        direction_id = direction_ids[k];
        times.push([]);
        headsigns.push("");
        
        for (i = 0; i < trips.length; i += 1) {
            if (service_id !== trips[i].service_id) {
                continue;
            }
            if (direction_id !== trips[i].direction_id) {
                continue;
            }
            headsigns[k] = trips[i].trip_headsign;
            for (j = 0; j < trips[i].stop_times.length; j += 1) {
                stop_time = trips[i].stop_times[j];
                if (stop_time.stop_id === stop_id) {
                    // console.log(stop_time.arrival_time);
                    arrival_time = this.dateFromTimeString(stop_time.arrival_time);
                    if (arrival_time > time) {
                        times[k].push({time: stop_time.arrival_time,
                                  direction: trips[i].direction_id});
                    }
                }
            }
        }
    }
    
    return {times:      times,
            headsigns:  headsigns};
};

AutobusClient.prototype.setMapForMarkers = function (route_id, map) {
    var i;
    if (typeof(this.markers[route_id]) !== "undefined") {
        for (i = 0; i < this.markers[route_id].inbound.length; i += 1) {
            this.markers[route_id].inbound[i].setMap(map);
        }
        for (i = 0; i < this.markers[route_id].outbound.length; i += 1) {
            this.markers[route_id].outbound[i].setMap(map);
        }
    }
};

AutobusClient.prototype.setMapForPath = function (route_id, map) {
    this.setMapForPathOnly(route_id, map);
    this.setMapForMarkers(route_id, map);
};

AutobusClient.prototype.setMapForPathOnly = function (route_id, map) {
    if (typeof(this.routePaths[route_id]) !== "undefined") {
        this.routePaths[route_id].inbound.setMap(map);
        this.routePaths[route_id].outbound.setMap(map);
    }
};

AutobusClient.prototype.showAllPaths = function () {
    var route_id, i, latlngbounds = new google.maps.LatLngBounds();

    for (route_id in this.markers) {
        for (i = 0; i < this.markers[route_id].inbound.length; i += 1) {
            latlngbounds.extend(this.markers[route_id].inbound[i].getPosition());
        }
        for (i = 0; i < this.markers[route_id].outbound.length; i += 1) {
            latlngbounds.extend(this.markers[route_id].outbound[i].getPosition());
        }
    }
    // this.map.fitBounds(latlngbounds);
    // this.map.setCenter(latlngbounds.getCenter());

    for (route_id in this.routes) {
        this.setMapForMarkers(route_id, null);
        this.setMapForPathOnly(route_id, this.map);
    }
    // this.map.setZoom(this.map.getZoom() + 1);
};

AutobusClient.prototype.getGoogleDirections = function(destLatLng) {
    var self = this;
    var dirReq = {
        origin: this.proximities.origin.getCenter(),
        destination: destLatLng,
        travelMode: this.travelMode == 'bike' ? google.maps.TravelMode.BICYCLING : google.maps.TravelMode.WALKING
    }
    this.directionsService.route(dirReq, function(result, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            self.directionsRenderer.setMap(self.map);
            self.directionsRenderer.setDirections(result);
            $(self.directionsRenderer.getPanel()).show();
        }
    });
}

AutobusClient.prototype.clearGoogleDirections = function(destLatLng) {
    this.directionsRenderer.setMap(null);
    $(this.directionsRenderer.getPanel()).hide();
    this.centerMap();
}

