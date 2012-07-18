/**
 *  AutobusClient
 *
 *  Created by Peter R. G. Small on 2012-05-07.
 *  Copyright (c) 2012 PRGSoftware, LLC. All rights reserved.
 */

/*global $ document google navigator AcequiaClient MapIconMaker setTimeout localStorage console*/

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
    
    this.agency = null;
    
    this.routes = {};
    
    this.stops = {};
    
    this.routePaths = {};
    
    this.markers = {};
    
    this.buses = {};
    
    this.currentPositionMarker = null;
    
    this.initialized = false;
    
    this.acequiaClient = null;
    
    this.allDataDownloaded = false;
};

AutobusClient.prototype.onStops = function (message) {
    this.stops = message.body[0];
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

    // Set up the acequia client and connect to the server
    this.acequiaClient = new AcequiaClient("autobus_" + Math.random());
    this.acequiaClient.on("version", objCallback(this, "onVersion"));
    this.acequiaClient.on("routes", objCallback(this, "onRoutesMessage"));
    this.acequiaClient.on("route", objCallback(this, "onRouteMessage"));
    this.acequiaClient.on("stops", objCallback(this, "onStops"));
    this.acequiaClient.on("busPosition", objCallback(this, "onBusPosition"));
    this.acequiaClient.addConnectionChangeHandler(objCallback(this, "onConnected"));
    this.acequiaClient.connect();
    
    // Start getting position updates
    this.getCurrentPosition();
};

AutobusClient.prototype.centerMapOnCurrentPositon = function () {
    this.map.setCenter(this.currentPositionMarker.getPosition());
};

AutobusClient.prototype.getCurrentPosition = function () {
    navigator.geolocation.getCurrentPosition(objCallback(this, "onPositionUpdate"));
};

AutobusClient.prototype.onConnected = function (connected) {
    if (connected) {
        this.acequiaClient.send("getVersion");
        this.acequiaClient.send("getStops");
    }
};

AutobusClient.prototype.onVersion = function (message) {
    var version = message.body[0].version, ls, routes,
        agency  = message.body[0].agency;
        
    if (this.allDataDownloaded) {
        return;
    }

    if (localStorage.getItem(agency.agency_id + "version") === version) {
        this.agency = JSON.parse(localStorage.getItem(agency.agency_id + "agency"));
        routes = JSON.parse(localStorage.getItem(agency.agency_id + "routes"));
        this.onRoutes(routes);
    } else {
        localStorage.clear();
        this.agency = agency;
        localStorage.setItem(agency.agency_id + "version", version);
        localStorage.setItem(agency.agency_id + "agency", JSON.stringify(agency));
        this.acequiaClient.send("getRoutes");    
    }
    
    this.setAgencyInfo();
};

AutobusClient.prototype.setAgencyInfo = function () {
    document.title = this.agency.agency_name;
    $("#home-title").html(this.agency.agency_name);
};

AutobusClient.prototype.onBusPosition = function (message) {
    var busInfo = message.body[0], label, rt,
        point   = new google.maps.LatLng(parseFloat(busInfo.lat), parseFloat(busInfo.lon));
    
    if (!this.buses[busInfo.route_id]) {
        rt = this.routes[busInfo.route_id];
        label = rt.id + ": " + rt.desc;
        this.buses[busInfo.route_id] = new google.maps.Marker({
            position: point,
            map: this.map,
            title: label,
            icon: MapIconMaker.createLabeledMarkerIcon({width: 20, height: 34, label: label, 
                                                        primaryColor: rt.color, labelColor: rt.color})
        });
    } else {
        this.buses[busInfo.route_id].setPosition(point);
    }
};

AutobusClient.prototype.onPositionUpdate = function (position) {
    var point = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
    if (!this.currentPositionMarker) {
        this.currentPositionMarker = new google.maps.Marker({
            position: point,
            map: this.map,
            title: "You Are Here",
            draggable: true
        });
    } else {
        this.currentPositionMarker.setPosition(point);
    }
    
    setTimeout(objCallback(this, "getCurrentPosition"), 2000);
};

AutobusClient.prototype.onRoutesMessage = function (message) {
    localStorage.setItem(this.agency.agency_id + "routes", JSON.stringify(message.body));
    this.onRoutes(message.body);
};

AutobusClient.prototype.onRoutes = function (message) {
    throw new Error("onRoutes NOT IMPLEMENTED");
};

AutobusClient.prototype.onRoute = function (route) {
    throw new Error("onRoute NOT IMPLEMENTED");
};

AutobusClient.prototype.onRouteMessage = function (message) {
    var trip, route = message.body[0];
    console.log(route.id + ": " + JSON.stringify(message).length);
    this.routes[route.id] = route;
    
    trip = this.getTripForRoute(route.id);
    if (trip !== null) {
        this.onRoute(trip);
    }
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
    var i, j, trips;
    
    trips = this.routes[route_id].trips;
    
    for (i = 0; i < trips.length; i += 1) {
        for (j = 0; j < trips[i].stop_times.length; j += 1) {
            if (trips[i].stop_times[j].stop_id === stop_id) {
                return trips[i].stop_times[j].stop;
            }
        }
    }

    return null;
};

AutobusClient.prototype.getAllStopsForRoute = function (route_id) {
    // Retrieve all of the stops for a route
    var inbound = [], outbound = [], service_id, trips, i, j, addToList;
    
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
            if (trips[i].direction_id === "0") {
                addToList(outbound, trips[i].stop_times[j].stop);
            } else {
                addToList(inbound, trips[i].stop_times[j].stop);
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
                    console.log(stop_time.arrival_time);
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
        for (i = 0; i < this.markers[route_id].length; i += 1) {
            this.markers[route_id][i].setMap(map);
        }
    }
};

AutobusClient.prototype.setMapForPath = function (route_id, map) {
    this.setMapForPathOnly(route_id, map);
    this.setMapForMarkers(route_id, map);
};

AutobusClient.prototype.setMapForPathOnly = function (route_id, map) {
    if (typeof(this.routePaths[route_id]) !== "undefined") {
        this.routePaths[route_id].setMap(map);
    }
};

AutobusClient.prototype.showAllPaths = function () {
    var route_id, i, latlngbounds = new google.maps.LatLngBounds();

    for (route_id in this.markers) {
        for (i = 0; i < this.markers[route_id].length; i += 1) {
            latlngbounds.extend(this.markers[route_id][i].getPosition());
        }
    }
    this.map.fitBounds(latlngbounds);
    this.map.setCenter(latlngbounds.getCenter());

    for (route_id in this.routes) {
        this.setMapForMarkers(route_id, null);
        this.setMapForPathOnly(route_id, this.map);
    }
    this.map.setZoom(this.map.getZoom() + 1);
};

