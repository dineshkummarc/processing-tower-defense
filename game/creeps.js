var known_best_paths = {}
var reset_pathfinding = function() {
  known_best_paths = {};
}

//Could a creep occupy this square?
var valid_path_location = function(gx, gy) {
  if (get_tower_at(gx,gy) != false)
    return false;
  if (SET.considering_location && SET.considering_location.gx == gx && SET.considering_location.gy == gy)
      return false;
  return true;
}

var pathfind = function(start_block) {
  if ([start_block.gx, start_block.gy] in known_best_paths) {
//     log("path found from cache", known_best_paths[start_block]);
    return known_best_paths[[start_block.gx, start_block.gy]].next_block.gpos;
  }
//   log("pathfinding started", start_block);

  var successors = function(block) {
    var candidates = [];
    var normal_dist = 10;
    [[0,1],[1,0],[-1,0],[0,-1]].forEach(function(pair) {
      var gpos = {gx:block.gpos.gx + pair[0], gy: block.gpos.gy + pair[1], dist:normal_dist};
      if (!valid_path_location(gpos.gx, gpos.gy)) return;
      if (gpos.gx < 0 || gpos.gx >= SET.gwidth) return;
      if (gpos.gy < 0 || gpos.gy >= SET.gheight) return;
      candidates.push(gpos);
    });

    var diag_dist = 14; //sqrt(2) * 10
    [[1,1],[-1,-1],[1,-1],[-1,1]].forEach(function(pair){
      var gpos = {gx:block.gpos.gx + pair[0], gy: block.gpos.gy + pair[1], dist:diag_dist};
      if (!(valid_path_location(gpos.gx, gpos.gy) && valid_path_location(block.gpos.gx, gpos.gy) && valid_path_location(gpos.gx, block.gpos.gy))) return;
      if (gpos.gx < 0 || gpos.gx >= SET.gwidth) return;
      if (gpos.gy < 0 || gpos.gy >= SET.gheight) return;
      candidates.push(gpos);
    })
    return candidates;
  }
  
  
  //straight-line distance as our heuristic
  var heuristic = function(gpos) {
    var dx = Math.abs(gpos.gx - SET.exit.gx);
    var dy = Math.abs(gpos.gy - SET.exit.gy);
    var dist = Math.min(dx,dy) * 14;
    dist += (Math.max(dx,dy) - Math.min(dx,dy)) * 10
    return dist
  }
  
  
  var closed = {};
  var pqueue = [{gpos:start_block, f:heuristic(start_block), g:0}];
  while (pqueue.length > 0) {
    var block = pqueue[0];
    pqueue = pqueue.slice(1);
//     log("looking at", block)
    if (closed[[block.gpos.gx, block.gpos.gy]] == true){
//       log("in closed, skipping", closed)
      continue;
    }
    if (block.gpos.gx == SET.exit.gx && block.gpos.gy == SET.exit.gy){
      known_best_paths[[block.gpos.gx, block.gpos.gy]] = block;
      while ("ancestor" in block) {
        block.ancestor.next_block = block;
        known_best_paths[[block.ancestor.gpos.gx, block.ancestor.gpos.gy]] = block.ancestor
        block = block.ancestor;
      }
//       log("known_best_paths", known_best_paths);
      var result = known_best_paths[[start_block.gx, start_block.gy]].next_block.gpos;
//       log("path found!", result);
      return result;
    }
    closed[[block.gpos.gx, block.gpos.gy]] = true;
//     log("closed", closed);
    successors(block).forEach(function(s) {
      var suc = {gpos:s, g:s.dist + block.g, ancestor:block};
      suc.f = suc.g + heuristic(suc.gpos);

      pqueue = insert_sorted(pqueue, suc, function(bl) {
        return bl.f
      });
    })

//     log("pqueue", pqueue);
  }
//   log("---------pathfinding failed!----------");
}

/*
  Used in by the Creep method "display stats" to
  support constantly updated hp for the specific
  selected creep. Conceivably one might move into
  another state immediately without transitioning
  into normal state before that. Preferably some
  kind of state cleanup function will be added to
  the state API, but at the moment it will function
  correctly anyway, because the creep div will either
  be invisible, or the most recent creephpupdater
  will be the last one called, meaning that the
  correct hp will be displayed even if there are
  multiple existing creephpupdaters in the
  system rendering level.
 */
var CreepHpUpdater = function(creep) {
  var chp = new Object();
  Object.extend(chp, InertDrawable);
  chp.update = function() {
    WIDGETS.creep_hp.innerHTML = creep.hp;
  }
  chp.should_die = false;
  chp.is_dead = function() {
    if (chp.should_die || !creep || !SET.state || SET.state.name() != "CreepSelectMode" || creep.is_dead()) {
      if (SET.state) {
      	SET.state.tear_down();
      	SET.state = undefined;
      }
      if (chp.kz)
      	chp.kz.is_dead = function() { return true; };
      return true;
    }
    else return false;
  }
  chp.draw = function() {
    if (chp.kz) chp.kz.is_dead = function() { return true; };
    chp.kz = KillZone(creep.x,creep.y,15);
  }

  assign_to_depth(chp, SET.system_render_level);
  return chp;
}


var Creep = function(wave) {
  var cp = SET.creeps_spawned;
  var c = new Object();
  c.x = SET.entrance.x_mid;
  c.y = SET.entrance.y_mid;
  c.color = SET.creep_color;
  c.size = SET.creep_size;
  c.hp = Math.floor(SET.creep_hp * Math.pow(1.4,wave));
  c.value = SET.creep_value + wave;
  c.speed = SET.creep_speed;
  c.last = millis();
  c.is_dead = function() {
    if (this.hp <= 0) {
      SET.gold += this.value;
      SET.score += this.value;
      return true;
    }
    return false;
  }
  c.update = function() {
    var gpos = pixel_to_grid(this);
    this.gx = gpos.gx;
    this.gy = gpos.gy;
    // if it reaches the exit, kill it, but reduce the players
    // lives and reduce its value to 0 (it will be collected
    // and destroyed in the is_dead phase.
    if (this.gx == SET.exit.gx && this.gy == SET.exit.gy) {
      this.hp = -1;
      this.value = 0;
      SET.lives--;
      if (SET.lives < 1) game_lost();
    }
    else {
      var elapsed = SET.now - this.last;
      var speed = (elapsed/1000) * this.speed;
      this.last = SET.now;

      var next_block = pathfind(gpos);
      if (next_block == undefined){
        game_lost();
        error("Pathfinding failed.  Erroring hard so that we catch these bugs.");
        log("creep",this);
        return;
      }
        
      var coords = center_of_square(next_block.gx, next_block.gy)
      var path = calc_path(this.x,this.y,coords.x,coords.y,speed);
      this.x += path.x;
      this.y += path.y;
    }
  }
  c.draw = function() {
    noStroke();
    fill(this.color);
    ellipse(this.x,this.y,this.size,this.size);
  }
  c.creep_type = "Normal Creep";
  c.display_stats = function() {
    WIDGETS.creep_type.innerHTML = this.creep_type;
    WIDGETS.creep_hp.innerHTML = this.hp;
    WIDGETS.creep_value.innerHTML = this.value + " gold";
    WIDGETS.creep.style.display = "block";
  }
  SET.creeps_spawned++;
  assign_to_depth(c, SET.creep_render_level);
  return c;
};

var FizCreep = function(wave) {
  var fc = Creep(wave);
  fc.creep_type = "Fiz Creep";
  fc.color = color(0,255,255);
  fc.size = fc.size * 1.3;
  fc.hp = Math.floor(fc.hp * 2);
  fc.value = Math.floor(fc.value * 1.5);
  fc.speed = fc.speed * 0.75;
  return fc;
};

var BuzzCreep = function(wave) {
  var bc = Creep(wave);
  bc.creep_type = "Buzz Creep";
  bc.color = color(100,150,50);
  bc.speed = bc.speed * 1.5;
  bc.hp = Math.floor(bc.hp * .75);
  bc.size = bc.size * 0.9;
  bc.value = Math.floor(bc.value * 1.25);
  return bc;
};

var FizBuzzCreep = function(wave) {
  var fbc = Creep(wave);
  fbc.creep_type = "FizBuzz Creep";
  fbc.color = color(255,100,150);
  fbc.size = fbc.size * 1.5;
  fbc.hp = fbc.hp * 10;
  fbc.value = fbc.value * 10;
  return fbc;
};