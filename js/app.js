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
    return parseFloat(input).toFixed(0) + "%"
  }
})
.filter("round", function() {
  return function(input) {
    return parseFloat(input).toFixed(0)
  }
})


