function slugify(text)
{
  return text.toString().toLowerCase()
  .replace(/\s+/g, '-')           // Replace spaces with -
  .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
  .replace(/\-\-+/g, '-')         // Replace multiple - with single -
  .replace(/^-+/, '')             // Trim - from start of text
  .replace(/-+$/, '');            // Trim - from end of text
}

var qs = (function(a) {
    if (a == "") return {};
    var b = {};
    for (var i = 0; i < a.length; ++i)
    {
        var p=a[i].split('=', 2);
        if (p.length == 1)
            b[p[0]] = "";
        else
            b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
    }
    return b;
})(window.location.search.substr(1).split('&'));

var patches = [
    {date: "2016-03-16 00:00:00 +0000", patch: "16.5", notes: "http://us.battle.net/heroes/en/blog/20057110"},
    {date: "2016-03-29 00:00:00 +0000", patch: "17.0", notes: "http://us.battle.net/heroes/en/blog/20063493"},
    {date: "2016-04-12 00:00:00 +0000", patch: "17.1", notes: "http://us.battle.net/heroes/en/forum/topic/20742939675#1"}
]
angular.module("data", [])
.service("Heroes", function($http) {
  this.all = function() {
    return $http.get("http://hotslogs.s3-website-us-east-1.amazonaws.com/manifest.json").then(function(response) {
      return response.data;
    });
  }
  this.history_for = function(hero) {
    return $http.get("http://hots-pull.herokuapp.com/history/" + hero).then(function(response) {
      return response.data;
    })
  }
  this.score_for = function(hero) {
    return (hero.win_rate * hero.popularity) / 100;
  }
  this.fetch = function(path) {
    return $http.get("http://hotslogs.s3-website-us-east-1.amazonaws.com" + path).then(function(response) {
        return response.data;
    })
  }
})
.service("Maps", function($http) {
  this.all = function() {
    return $http.get("http://hotslogs.s3-website-us-east-1.amazonaws.com/maps.json").then(function(response) {
      return response.data;
    });
  }
})

angular.module("evolutionpit", ["data"])
.controller("MiniMap",function($scope, Maps) {
  $scope.maps = [];
  for(var i = 0; i<9; ++i) {
    $scope.maps.push({
      name: "--",
      average_length: "--",
      heroes: [{name: "--"}]
    });
  }

  Maps.all().then(function(maps) {
    $scope.maps = _.map(maps, function(map) {
      map.average_length = map.average_length.substring(3);
      return map;
    });
  });
})


.controller("Header", function($rootScope, $scope) {
  $rootScope.league = "Quick Match";
})

.controller("TheMeta", function($scope, Heroes) {
  $scope.heroes = [];

  // Fill with junk data while 
  // actual data loads
  for(var i = 0; i<5; ++i) {
    $scope.heroes.push({
      name: "--",
      score: "--",
      win_rate: "--"
    });
  }

  Heroes.all().then(function(heroes) {
    $scope.heroes = _.sortBy(_.map(heroes, function(hero) {
      hero.score = Heroes.score_for(hero); 
      return hero;
    }), "score").reverse().slice(0,5);
  });

})
.filter("percent", function() {
  return function(input) {
    var parsed = parseFloat(input);
    if(parsed) {
      return parseFloat(input).toFixed(0) + "%"
    } else {
      return input;
    }
  }
})
.filter("round", function() {
  return function(input) {
    var parsed = parseFloat(input);
    if(parsed) {
      return parseFloat(input).toFixed(0)
    } else {
      return input;
    }
  }
})

.controller("HeroList", function($scope, Heroes, $q) {
  $scope.loading = true;
  
  Heroes.all().then(function(heroes) {
    $scope.heroes = _.map(heroes,function(hero) {
      hero.score = ((hero.win_rate) * hero.popularity) / 100
      return hero;
    });


    var promises = [];

    $scope.heroes.forEach(function(hero) {
      promises.push(Heroes.history_for(hero.name).then(function(data) {
        return data.map(function(datum) {
          return {
            name: datum.name,
            date: datum.date,
            score: (datum.win_rate * datum.popularity) / 100,
            win_rate: datum.win_rate,
            popularity: datum.popularity,
            games_played: datum.games_played
          }
        });
      }));
    });

    $scope.$watch("graphing", function(val) {
        renderGraph();
    });

    $scope.go = function(hero) {
        window.location.href = "/hero/" + slugify(hero.name);
    }

    function renderGraph() {
        $q.all(promises).then(function(a) {
          $scope.loading = false;

          var margin = {top: 20, right: 40, bottom: 40, left: 50};
          var width = 920 - margin.left - margin.right;
          var height = 400 - margin.top - margin.bottom;

          var x = d3.time.scale().range([0, width]);
          var y = d3.scale.linear().range([height, 0]);
          x.ticks(d3.time.day, 1);

          var formatDate = d3.time.format("%Y-%m-%d %H:%M:%S +0000");

          var yMin = _.min(_.map(a, function(hero) {
            return _.min(hero, function(datum) {
              return datum[$scope.graphing];
            })[$scope.graphing];
          }));
          var yMax = _.max(_.map(a, function(hero) {
            return _.max(hero, function(datum) {
              return datum[$scope.graphing];
            })[$scope.graphing];
          }));
          
          var xMin = formatDate.parse(_.min(a[0], function(datum) {
            return formatDate.parse(datum.date);
          }).date);
          var xMax =formatDate.parse(_.max(a[0], function(datum) {
            return formatDate.parse(datum.date);
          }).date);

          x.domain([xMin, xMax]);
          y.domain([yMin, yMax]);

          var xAxis = d3.svg.axis().scale(x).orient("bottom");
          var yAxis = d3.svg.axis().scale(y).orient("left");
          xAxis.ticks(_.min([(a[0].length), 10]));
          xAxis.tickFormat(d3.time.format("%m/%d"));

          d3.select(".hero-graph svg").remove()

          var line = d3.svg.line()
                     .x(function(d) { return x(formatDate.parse(d.date)); })
                     .y(function(d) { return y(d[$scope.graphing]) }); 

          var svg = d3.select(".hero-graph").append("svg").attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom).append("g")
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


          if($scope.graphing == "win_rate") {
            svg.append("line")
                .attr("x1", x(xMin))
                .attr("x2", x(xMax))
                .attr("y1", y(50))
                .attr("y2", y(50))
                .style("stroke-width", (y(45) - y(55)))
                .style("stroke", "#F3F3F3")
            svg.append("line")
                .attr("x1", x(xMin))
                .attr("x2", x(xMax))
                .attr("y1", y(50))
                .attr("y2", y(50))
                .style("stroke-width", (y(48) - y(52)))
                .style("stroke", "#E5E5E5")

          }

        

         _.each(patches, function(patch) {
             svg.append("line")
                .attr("x1", x(formatDate.parse(patch.date)))
                .attr("y1", 0)
                .attr("x2", x(formatDate.parse(patch.date)))
                .attr("y2", height)
                .style("stroke-width", 4)
                .style("stroke", "#BBBBBB").style("fill", "none")
                .style("cursor", "pointer")
                .on("click", function() {
                    window.open(patch.notes);
                });
             svg.append("text")
                .attr("x", x(formatDate.parse(patch.date)))
                .attr("y", -5)
                .text(patch.patch)
                .attr("class", "patch-label")
                .style("font-size", "10px")
                .style("fill", "#BBBBBB")
                .style("cursor", "pointer")
                .on("click", function() {
                    window.open(patch.notes);
                });
         })

          

          _.each(a, function(hero) {
            var min = _.min(hero, function(h) { return h[$scope.graphing] });
            var max = _.max(hero, function(h) { return h[$scope.graphing] });
            var isInteresting = !(max[$scope.graphing] - min[$scope.graphing] < 1);
            if($scope.graphing === "win_rate") {
                isInteresting = !(max[$scope.graphing] - min[$scope.graphing] < 2.75);
            }
            _.each(hero, function(element, index) {
              if(index > 0 && index) {
                var baseline = svg.append('path').datum(hero.slice(index - 1, index + 1)).attr("class", "line " + slugify(hero[0].name) + " " + (isInteresting ? "" : "boring")).attr("d",line)

                baseline.append("svg:title").text(function(d) { 
                  var name = d[0].name;
                  var firstScore = d[0][$scope.graphing].toFixed(1);
                  var secondScore = d[1][$scope.graphing].toFixed(1);
                  var delta = (secondScore - firstScore).toFixed(1);
                  var cardinality = (delta > 0) ? "+" : "";
                  return name + ": " + firstScore + " - " + secondScore + " (" + cardinality + delta + ")";
                })

                svg.append('path').datum(hero.slice(index - 1, index + 1)).attr("class", "line hover").attr("d",line)
                .on("mouseover", function(d) {
                  $scope.$apply(function() {
                    $scope.activeHero = d[0];
                    baseline.attr("class", baseline.attr('class') + " active")
                  });
                })

                .on("mouseout", function(d) {
                  $scope.$apply(function() {
                    $scope.activeHero = null;
                    baseline.attr("class", baseline.attr("class").replace(" active", ""));
                  });
                })
                .append("svg:title").text(function(d) { 
                  var name = d[0].name;
                  var firstScore = d[0][$scope.graphing].toFixed(1);
                  var secondScore = d[1][$scope.graphing].toFixed(1);
                  var delta = (secondScore - firstScore).toFixed(1);
                  var cardinality = (delta > 0) ? "+" : "";
                  return name + ": " + firstScore + " - " + secondScore + " (" + cardinality + delta + ")";
                })
              }
            });

            _.each(hero, function(h) {
              if(!isInteresting) return;
              svg.append("circle").datum(h)
              .attr("cx", function(d) { return x(formatDate.parse(d.date)) })
              .attr("cy", function(d) { return y(d[$scope.graphing]) })
              .attr("r", 2)
              .on("mouseover", function(d) {
                $scope.$apply(function() {
                  $scope.activeHero = d;
                });
              })
              .on("mouseout", function(d) {
                $scope.$apply(function() {
                  $scope.activeHero = null;
                });
              })
              .attr("class", "circle " + slugify(h.name))
              .append("svg:title").text(function(d) { return d.name + ": " + d.score.toFixed(1) })
            })
          });

          svg.append("g").attr("class", "y axis").call(yAxis).append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
            .text({'score': "Meta Score", 'win_rate': "Win Rate", 'popularity': "Popularity"}[$scope.graphing])

          svg.append("g").attr("class", "x axis")
          .attr("transform", "translate(0, " + height + ")").call(xAxis);
    });
    }
  });
})
.controller("HeroDetail", function($scope, Heroes, $location) {
    $scope.league = "Hero League";
    $scope.map = "All";
    Heroes.all().then(function(heroes) {
        $scope.hero = _.findWhere(heroes, {name: qs.name});
        Heroes.fetch($scope.hero.data_url).then(function(hero) {
            $scope.hero.builds = hero;
            Heroes.history_for($scope.hero.name).then(function(history) {
          var margin = {top: 20, right: 100, bottom: 40, left: 50};
          var width = 920 - margin.left - margin.right;
          var height = 400 - margin.top - margin.bottom;

          var x = d3.time.scale().range([0, width]);
          var y = d3.scale.linear().range([height, 0]);
          x.ticks(d3.time.day, 1);

          var formatDate = d3.time.format("%Y-%m-%d %H:%M:%S +0000");

          var yMin = _.min(_.map(history, function(hero) {
              return _.min([hero.win_rate, hero.popularity, (hero.win_rate * hero.popularity / 100)]);
          }));
          var yMax = _.max(_.map(history, function(hero) {
              return _.max([hero.win_rate, hero.popularity, (hero.win_rate * hero.popularity / 100)])
          }));
          
          var xMin = formatDate.parse(_.min(history, function(datum) {
            return formatDate.parse(datum.date);
          }).date);
          var xMax =formatDate.parse(_.max(history, function(datum) {
            return formatDate.parse(datum.date);
          }).date);
            var wrLine = d3.svg.line()
                 .x(function(d) { return x(formatDate.parse(d.date)); })
                 .y(function(d) { return y(d.win_rate) }); 
            var popLine = d3.svg.line()
                 .x(function(d) { return x(formatDate.parse(d.date)); })
                 .y(function(d) { return y(d.popularity) }); 


          x.domain([xMin, xMax]);
          y.domain([0, 100]);
          var svg = d3.select(".hero-graph").append("svg").attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom).append("g")
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        _.each(patches, function(patch) {
             svg.append("line")
                .attr("x1", x(formatDate.parse(patch.date)))
                .attr("y1", 0)
                .attr("x2", x(formatDate.parse(patch.date)))
                .attr("y2", height)
                .style("stroke-width", 4)
                .style("stroke", "#BBBBBB").style("fill", "none")
                .style("cursor", "pointer")
                .on("click", function() {
                    window.open(patch.notes);
                });
             svg.append("text")
                .attr("x", x(formatDate.parse(patch.date)))
                .attr("y", -5)
                .text(patch.patch)
                .attr("class", "patch-label")
                .style("font-size", "10px")
                .style("fill", "#BBBBBB")
                .style("cursor", "pointer")
                .on("click", function() {
                    window.open(patch.notes);
                });
         })
            _.each(history, function(element, index) {
              if(index > 0 && index) {
                svg.append('path').datum(history.slice(index - 1, index + 1)).attr("class", "line " + slugify(element.name) + " win-rate").attr("d",wrLine)
                .append("svg:title").text(function(d) { 
                  var firstScore = d[0].win_rate.toFixed(1);
                  var secondScore = d[1].win_rate.toFixed(1);
                  var delta = (secondScore - firstScore).toFixed(1);
                  var cardinality = (delta > 0) ? "+" : "";
                  return firstScore + "% - " + secondScore + "% (" + cardinality + delta + "%)";
                })
                svg.append('path').datum(history.slice(index - 1, index + 1)).attr("class", "line " + slugify(element.name) + " popularity").attr("d",popLine)
                .append("svg:title").text(function(d) { 
                    var firstScore = d[0].popularity.toFixed(1);
                  var secondScore = d[1].popularity.toFixed(1);
                  var delta = (secondScore - firstScore).toFixed(1);
                  var cardinality = (delta > 0) ? "+" : "";
                  return firstScore + "% - " + secondScore + "% (" + cardinality + delta + "%)";
                })
              }
            });

          var xAxis = d3.svg.axis().scale(x).orient("bottom");
          var yAxis = d3.svg.axis().scale(y).orient("left");
          xAxis.ticks(_.min([(history.length), 10]));
          xAxis.tickFormat(d3.time.format("%m/%d"));
            svg.append("g").attr("class", "y axis").call(yAxis).append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")

          svg.append("text")
            .attr("class", "label popularity")
            .attr("x", x(formatDate.parse(history[history.length - 1].date)) + 5)
            .attr("y", y(history[history.length - 1].popularity) + 3)
            .text("Popularity");

          svg.append("text")
            .attr("class", "label win-rate")
            .attr("x", x(formatDate.parse(history[history.length - 1].date)) + 5 )
            .attr("y", y(history[history.length - 1].win_rate) + 3)
            .text("Win Rate");



          svg.append("g").attr("class", "x axis")
          .attr("transform", "translate(0, " + height + ")").call(xAxis);
        })

        })
    });
})

