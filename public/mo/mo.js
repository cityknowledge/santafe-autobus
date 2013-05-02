/*global $ window document google MapIconMaker AutobusClient 
  google console InfoBubble setInterval clearInterval objCallback*/

var disableButtons = function () {
    $("div[data-role=footer]>a").addClass('ui-disabled');
    $("#ajaxLoader").show();
};

var enableButtons = function () {
    this.allDataDownloaded = true;
    $("div[data-role=footer]>a").removeClass('ui-disabled');
    $("#ajaxLoader").hide();
};

var app = new AutobusClient();

app.onRoutes = function (routes) {
    var i;
    
    this.nextIndex = -1;
    this.route_ids = [];
    
    for (i = 0; i < routes.length; i += 1) {
        this.addRoute(routes[i]);
    }
    
    this.getNextRoute();
};

app.getNextRoute = function () {
    var rt;
    this.nextIndex += 1;
    if (this.nextIndex < this.route_ids.length) {
        rt = this.retrieve("route" + this.route_ids[this.nextIndex]);
        if (rt === null) {
            this.acequiaClient.send("getRoute", {route_id: this.route_ids[this.nextIndex]});
        } else {
            this.processRoute(rt);
        }
    }   
};

app.addRoute = function (rt) {
    var eleId = "route-li-" + rt.id;
    
    this.routes[rt.id] = rt;
    this.route_ids.push(rt.id);
        
    $("<li></li>")
        .attr("id", eleId)
        .attr("data-theme", "b")
        .appendTo("#route-listview");

    $("<a></a>")
        .attr("href", "#route_" + rt.id)
        .attr("data-transition", "slide")
        .html(rt.id + ": " + rt.desc)
        .appendTo("#" + eleId);
        
    this.addRoutePage(rt);
};

app.addRoutePage = function (rt) {

    var pageId = "route_" + rt.id;
    $("<div></div")
        .attr("data-role", "page")
        .attr("data-theme", "b")
        .attr("id", pageId)
        .addClass("map-page")
        .appendTo("body");
        
    $("<div></div>")
        .attr("data-theme", "b")
        .attr("data-role", "header")
        .attr("id", "header-" + pageId)
        .appendTo("#" + pageId);
        
    $("<h3></h3>")
        .html(rt.long_name + ": " + rt.desc)
        .appendTo("#header-" + pageId);
        
    $("<a></a>")
        .attr("data-role", "button")
        .attr("data-transition", "slide")
        .attr("data-direction", "reverse")
        .attr("href", "#bus_routes_page")
        .attr("data-icon", "arrow-l")
        .attr("data-iconpos", "left")
        .html("Back")
        .appendTo("#header-" + pageId);
    
    $("<div></div>")
        .attr("data-role", "content")
        .addClass("map-content")
        .appendTo("#" + pageId);
        
    $("#app-footer").clone().appendTo("#" + pageId);    
};

app.infowindow = new InfoBubble({
    padding: 10,
    borderRadius: 5,
    arrowSize: 15,
    arrowStyle: 0,
    arrowPosition: 50,
    maxWidth: 150,
    borderColor: "#ccc",
    backgroundColor: "#fff"
});

app.onRoute = function (trip) {
    var routePath, point, marker, routeCoordinatesInbound = [],
        routeCoordinatesOutbound = [], color, stops, addMarkersForRoute, onclick;
    var INBOUND = 1, OUTBOUND = 0;
    var self = this;

    this.checkRoutes();
    
    this.getNextRoute();
    
    if (trip === null) {
        return;
    }
    
    onclick = function (i, m) {
        return function () {
            app.displayNextBuses(m.route_id, m.stop_id);
            self.showInfoPanel();
        };
    };
    
    stops = this.getAllStopsForRoute(trip.route_id);
    
    addMarkersForRoute = function (stops, inbound, self) {
        var i, stop;
        for (i = 0; i < stops.length; i += 1) {
            stop = stops[i];
            point = new google.maps.LatLng(parseFloat(stop.lat), parseFloat(stop.lon));
            if (inbound) routeCoordinatesInbound.push(point);
            else routeCoordinatesOutbound.push(point);

            marker = new google.maps.Marker({
                position: point,
                map: null,
                title: trip.route_id + ": " + stop.name,
                icon: MapIconMaker.createMarkerIcon({width: 20, height: 34, primaryColor: color}),
                stop_id: stop.id,
                route_id: trip.route_id
            });

            if (inbound) self.markers[trip.route_id].inbound.push(marker);
            else self.markers[trip.route_id].outbound.push(marker);

            google.maps.event.addListener(marker, 'click', onclick(self.infowindow, marker));
        }
    };
    
    color = "#" + this.routes[trip.route_id].color;
    
    this.markers[trip.route_id] = {
        inbound: [],
        outbound: []
    };
    // TODO: Look into why stops.inbound has outbound stops and vice versa
    addMarkersForRoute(stops.inbound, OUTBOUND, this);
    addMarkersForRoute(stops.outbound, INBOUND, this);

    var arrow = { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW };

    routePaths = {
        inbound: new google.maps.Polyline({
            path: routeCoordinatesInbound,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 2,
            // map: this.map,
            icons: [{
                icon: arrow,
                repeat: '50px',
                offset: '25px'
            }]
        }),
        outbound: new google.maps.Polyline({
            path: routeCoordinatesOutbound,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 2,
            // map: this.map,
            icons: [{
                icon: arrow,
                repeat: '50px',
                offset: '25px'
            }]
        })
    };

    $("#route_" + trip.route_id).css("opacity", "1.0");
    
    this.routePaths[trip.route_id] = routePaths;
    this.routePaths[trip.route_id][this.direction].setMap(this.map);
    // this.showAllPaths();
    // this.toggleInbound();
    this.displayRelevantStops();
};

app.checkRoutes = function () {
    var route_id;
    for (route_id in this.routes) {
        if (typeof(this.routes[route_id].trips) === "undefined") {
            return;
        }
    }
    enableButtons();
};

app.addNextBusTimes = function (ele_id, times, headsign, route_id, stop_id) {
    var j, count, onclick;
    ele_id = "#" + ele_id;
    
    count = Math.min(5, times.length);
    
    if (count === 0) {
        $(ele_id).hide();
    } else {
        $(ele_id).show();        
    }
    
    $(ele_id + "-title").html(headsign);

    function onclick(time) {
        return function() { app.scheduleTrip(route_id, stop_id, time); }
    }

    for (j = 0; j < count; j += 1) {
        var curTime = times[j].time;
        var icons = $('<div class="icon_group"></div>')
            .append('<img class="travel_icon WALKING" src="images/walking2.png" />')
            .append('<img class="travel_icon BICYCLING" src="images/bicycle2.png" />')
            .append('<img class="travel_icon DRIVING" src="images/car.png" />');
        var timeButton = $('<a href="#" data-icon="false"></a>')
            .append('<span class="time_text">'+curTime+'</span>')
            .append(icons)
            .click(onclick(curTime));
        $('<li data-theme="c"></li>')
            .append(timeButton)
            .appendTo(ele_id);
    }
    
    try {
        $(ele_id).listview('refresh');
    } catch (e) {
        // Eat the exception
    }
};

app.evaluateTravelModes = function(destLatLng) {
    var self = this;

    self.travelTimes = {};

    self.directionsOrigin = this.proximities.origin.getCenter();
    self.directionsDestination = destLatLng;

    function updateIcons(mode) {
        var cutoffs = { // if secondsToDepart < cutoffs, you need to hurry
            DRIVING: { red: 5*60 },
            BICYCLING: { red: 3*60 },
            WALKING: { red: 1*60 }
        };

        return function(result, status) {
            var travelTime = 0;
            if (status == google.maps.DirectionsStatus.OK) {
                var route = result.routes[0];
                for (var i = 0; i < route.legs.length; i++) {
                    travelTime += route.legs[i].duration.value;
                }
                self.travelTimes[mode] = travelTime;

                var now = new Date();

                $("#info_panel a").each(function() {
                    if ($(this).children(".time_text").length > 0) {
                        var scheduledTime = self.parseTimeString($(this).children(".time_text").text());
                        var secondsToDepart = (scheduledTime.getTime() - now.getTime())/1000 - travelTime;
                        
                        var icon = $(this).children(".icon_group").children("."+mode);
                        if (secondsToDepart <= 0) {
                            icon.addClass("disabled");
                        }
                        else if (secondsToDepart <= cutoffs[mode]["red"]) {
                            icon.addClass("hurried");
                        }
                    }
                });
            }
        }
    }

    var bikeReq = {
        origin: this.proximities.origin.getCenter(),
        destination: destLatLng,
        travelMode: google.maps.TravelMode.BICYCLING
    }
    this.directionsService.route(bikeReq, updateIcons("BICYCLING"));

    var walkReq = {
        origin: this.proximities.origin.getCenter(),
        destination: destLatLng,
        travelMode: google.maps.TravelMode.WALKING
    }
    this.directionsService.route(walkReq, updateIcons("WALKING"));

    var carReq = {
        origin: this.proximities.origin.getCenter(),
        destination: destLatLng,
        travelMode: google.maps.TravelMode.DRIVING
    }
    this.directionsService.route(carReq, updateIcons("DRIVING"));
}

app.displayNextBuses = function (route_id, stop_id) {
    var arrivals, j, onclick, rt = this.routes[route_id], count, stop;
    
    var CloseButton = function() {
        return $("<a>")
            .attr({
                "data-role":"button",
                "data-icon":"delete",
                "data-theme":"b",
                "data-mini":"true",
                "data-iconpos":"notext",
                "data-inline":"true",
                "href":""
            })
            .css({
                position: "absolute",
                right: "0px",
                top: "-3px"
            })
            .text("Close")
            .click(app.hideInfoPanel)
            .button()
    }

    stop = this.stopForStopId(route_id, stop_id);
    arrivals = this.getNextArrivalsForStop(route_id, stop_id);

    $("#next_bus_title").html("Next Buses for " + rt.id + ": " + rt.desc + "<br/>Stop: " + stop.name);
    
    $("#next-bus-listview-inbound").hide();
    $("#next-bus-listview-outbound").hide();
    $("#next-bus-listview-inbound-title~li").remove();
    $("#next-bus-listview-outbound-title~li").remove();

    var newTitle = stop.name;

    if (this.direction == 'inbound') {
        $("#next-bus-listview-inbound-title").text(newTitle+" - Inbound");
        $("#next-bus-listview-inbound-title").append(new CloseButton());
        this.addNextBusTimes("next-bus-listview-inbound", arrivals.times[0], arrivals.headsigns[0], route_id, stop_id);
    }
    else {
        $("#next-bus-listview-outbound-title").text(newTitle+" - Outbound");
        $("#next-bus-listview-outbound-title").append(new CloseButton());
        this.addNextBusTimes("next-bus-listview-outbound", arrivals.times[1], arrivals.headsigns[1], route_id, stop_id);    
    }

    // this.googleDirections = { DRIVING: null, WALKING: null, BICYCLING: null }; // stores directionService routes
    this.evaluateTravelModes(new google.maps.LatLng(parseFloat(stop.lat), parseFloat(stop.lon)));
};

// converts hh:mm:ss to a Date object
app.parseTimeString = function(txt) {
    var timeParts = txt.split(":");
    console.log(txt, timeParts);
    var dateObj = new Date();
    dateObj.setHours(parseInt(timeParts[0], 10));
    dateObj.setMinutes(parseInt(timeParts[1], 10));
    dateObj.setSeconds(parseInt(timeParts[2], 10));
    return dateObj;
}

app.setSelectedBusDateTime = function (txt) {
    this.selectedBusDateTime = this.parseTimeString(txt);
};

app.displaySinglePath = function (route_id) {
    var id, latlngbounds = new google.maps.LatLngBounds();
    
    for (id in this.routes) {
        if (id === route_id) {
            this.setMapForMarkers(id, this.map);
            this.setMapForPath(id, this.map);
        } else {
            this.setMapForMarkers(id, null);
            this.setMapForPath(id, null);
        }
    }

    this.routePaths[route_id].inbound.getPath().forEach(function (n) {
        latlngbounds.extend(n);
    });

    this.routePaths[route_id].outbound.getPath().forEach(function (n) {
        latlngbounds.extend(n);
    });

    this.map.fitBounds(latlngbounds);
    this.map.setCenter(latlngbounds.getCenter());
};

app.findLocation = function(searchString) {
    console.log(searchString);
    var self = this;
    this.geocoder.geocode({
        'address': searchString+", Santa Fe, NM",
        'bounds': this.mapBounds
    }, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            console.log(self.mapBounds.toString())
            var resPos = results[0].geometry.location;
            self.map.fitBounds(self.proximities.currentLocation.getBounds().extend(results[0].geometry.location));
            self.destMarker.setOptions({
                map: self.map,
                position: resPos
            });
            console.log(results[0]);
            self.destWindow.setContent(results[0].formatted_address);
            self.destWindow.open(self.map, self.destMarker);
            self.proximities.destination.setCenter(resPos);
            self.displayRelevantStops();
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
    });
}

app.displayRelevantStops = function() {
    var i, route_id, m, stops = [];
    
    // // Hide any stops that are displayed    
    for (route_id in this.routes) {
        this.setMapForMarkers(route_id, null);
    }

    // Find the stops that are on the map by looping through the markers
    for (route_id in this.markers) {
        for (i = 0; i < this.markers[route_id][this.direction].length; i += 1) {
            m = this.markers[route_id][this.direction][i];
            for (circName in this.proximities) {
                var bounds = this.proximities[circName].getBounds();
                if (bounds && bounds.contains(m.getPosition())) {
                    m.setMap(this.map);
                    break;
                }
            }
        }
    }
}

app.requestVan = function() {
    function pad(n) {
        var s = n.toString();
        return s.length < 2 ? '0' + s : s;
    }

    var content =
        'A van will pick you up at '+
        this.selectedBusDateTime.getHours()+':'+pad(this.selectedBusDateTime.getMinutes()-5)+
        '.';

    $("#trip_content #departure_msg").empty();
    $("#trip_content #departure_msg").append(content);   
}

app.showDepartureMessage = function() {
    function pad(n) {
        var s = n.toString();
        return s.length < 2 ? '0' + s : s;
    }

    var now = new Date();
    var millisToDeparture = this.selectedBusDateTime.getTime() - now.getTime() - this.travelTimes[this.travelMode]*1000;
    var departureDate = new Date();
    departureDate.setTime(now.getTime()+millisToDeparture);
    var content =
        'You should begin '+this.travelMode.toLowerCase()+
        ' at '+departureDate.getHours()+':'+pad(departureDate.getMinutes())+'.';

    $("#trip_content #departure_msg").empty();
    $("#trip_content #departure_msg").append(content);
}

app.scheduleTrip = function(route_id, stop_id, arrivalTime) {
    var self = this;
    console.log("Scheduling",route_id, stop_id, arrivalTime);
    this.setSelectedBusDateTime(arrivalTime);
    this.startCountdownTimer();
    this.hideInfoPanel();
    this.showDepartureMessage();
    var direction = this.direction == 'inbound' ? 'Inbound' : 'Outbound';
    var stop = this.stopForStopId(route_id, stop_id);
    var content =
        direction + ' bus' +
        ' on <b>line ' + route_id + '</b>' +
        ' will arrive at <b>' + stop.name + '</b>' +
        ' in <span id="minutes"></span>.';

    $("#trip_content #bus_msg").empty();
    $("#trip_content #bus_msg").append(content);

    var trip_panel = $("#trip_panel");
    if (!trip_panel.is(":visible")) {
        trip_panel.show();
        trip_panel.animate({
            bottom: "32px"
        });
        var map_canvas = $("#map_canvas");
        var trip_panel_height = trip_panel.height();
        var map_canvas_height = map_canvas.height();
        map_canvas.animate({
            height: (map_canvas_height-trip_panel_height)+"px"
        }, function() {
            google.maps.event.trigger(self.map, 'resize');
        });
    }

    app.getGoogleDirections(this.directionsOrigin, this.directionsDestination, this.travelMode);
}

app.cancelTrip = function() {
    var trip_panel = $("#trip_panel");
    var self = this;
    trip_panel.animate({
        bottom: -1*trip_panel.height()+"px"
    }, function() {
        trip_panel.hide();
        self.stopCountdownTimer();
    });
    $("#map_canvas").animate({
        height: "100%"
    }, function() {
        google.maps.event.trigger(self.map, 'resize');
    });
    this.clearGoogleDirections();
}

app.showInfoPanel = function() {
    var info_panel = $("#info_panel");
    var newTop = $("body").height() - 75 - info_panel.height();
    info_panel.show();
    info_panel.animate({
        top: newTop +"px"
    });
}

app.hideInfoPanel = function() {
    var info_panel = $("#info_panel");
    if (info_panel.is(":visible")) {
        info_panel.animate({
            top: $("body").height()+"px"
        }, function() {
            info_panel.hide();
        });
    }
}

app.setTravelMode = function(mode) {
    this.travelMode = mode;
    this.getGoogleDirections(this.directionsOrigin, this.directionsDestination, mode);
    this.showDepartureMessage();
}

// app.showGoogleDirections = function(mode) {
//     this.directionsRenderer.setMap(this.map);
//     this.directionsRenderer.setOptions({
//         suppressMarkers: true,
//         suppressInfoWindows: true,
//         suppressBicyclingLayer: true
//     });
//     this.directionsRenderer.setDirections(this.googleDirections[mode]);
//     // this.directionsRenderer.setOptions({
//     //     suppressMarkers: true
//     // });
//     $(this.directionsRenderer.getPanel()).show();
// }

app.toggleInbound = function() {
    this.direction = "inbound";
    for (route_id in this.routePaths) {
        this.routePaths[route_id].inbound.setMap(this.map);
        this.routePaths[route_id].outbound.setMap(null);    
    }
    this.displayRelevantStops();
}

app.toggleOutbound = function() {
    this.direction = "outbound";
    for (route_id in this.routePaths) {
        this.routePaths[route_id].inbound.setMap(null);
        this.routePaths[route_id].outbound.setMap(this.map);   
    }
    this.displayRelevantStops();
}

app.countdownInterval = null;
app.selectedBusDateTime = null;

app.decrementCoundownTimer = function () {
    var now, timeDiff, txtTime, time, pad, hours, minutes, seconds;
    
    pad = function (n) {
        var s = n.toString();
        return s.length < 2 ? '0' + s : s;
    };
    
    now = new Date();
    time = this.selectedBusDateTime.getTime() - now.getTime();

    if (time <= 0) {
        txtTime = "00:00:00";
        this.stopCountdownTimer();
    } else {
        // convert to seconds
        time = Math.floor(time / 1000);
        hours = Math.floor(time / 3600);
        time = time % 3600;
        minutes = Math.floor(time / 60);
        seconds = time % 60;

        txtTime = pad(hours) + ":" +  pad(minutes) + ":" +  pad(seconds);
        // txtTime = pad(hours) + ":" +  pad(minutes) + ":" +  pad(seconds);
    }
       
    $("#minutes").text(txtTime);     
    // $("#minutes").text(minutes);
    // $("#countDownText").html(txtTime);
};

app.stopCountdownTimer = function () {
    clearInterval(this.countdownInterval);
    this.countdownInterval = null;
};

app.startCountdownTimer = function () {
    this.decrementCoundownTimer();
    this.countdownInterval = setInterval(objCallback(this, "decrementCoundownTimer"), 1000);
};

var setMapParent = function (pageId, append) {
    var map_canvas = $("#map_canvas").detach();
    if (typeof(append) === "undefined") {
        map_canvas.prependTo("#" + pageId + " div[data-role=content]");        
    } else {
        map_canvas.appendTo("#" + pageId + " div[data-role=content]");
    }
};

$(document).ready(function (evt) {
    // preload the spinner gif
    $('<img />').attr('src',"images/sftrails-loader.gif").appendTo('body').hide();
    disableButtons();
    app.init(15, 35.6660, -105.9632, 
             google.maps.MapTypeId.ROADMAP,
             { mapTypeControl: false
             , streetViewControl: false
             , zoomControl: false
             , panControl: false });
    
    // listen for submissions to search field
    $("#search_form").submit(function(evt) {
        app.findLocation($("#search_input").val());
        return false;
    });

    // hide the info panel
    $("#info_panel").css("top",$(document).height()+"px");
    $("#trip_panel").css("bottom",-1*$("#trip_panel").height()+"px");

});

$(document).bind("pagechange", function (evt, data) {
   
    switch (data.toPage[0].id) {
    case "home":
        // setMapParent(data.toPage[0].id);
        // try {
        //     app.showAllPaths();
        //     if (app.circ) {
        //         app.circ.setMap(null);
        //     }
        //     app.infowindow.close();
        // } catch (e) {
        // }
        // app.displayNearbyStops();
        break;

    case "where_am_i":
        setMapParent(data.toPage[0].id);
        app.displayWhereIAm();
        break;
        
    case "count-down":
        setMapParent(data.toPage[0].id, true);
        app.startCountdownTimer();
        break;
        
    default:
        if (data.toPage[0].id.indexOf("route_") === 0) {
            setMapParent(data.toPage[0].id);
            app.displaySinglePath(app.routeIdFromEleId(data.toPage[0].id));
        }
        break;
    }
});

