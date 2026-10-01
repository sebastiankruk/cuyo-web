#
#   Copyright 2011,2014 by Mark Weyer
#
#   This program is free software; you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation; either version 2 of the License, or
#   (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program; if not, write to the Free Software
#   Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
#

Secret = {
  name = " "
  author = "Mark Weyer"
  description = "Congratulations, you found the secret level"
  pics = Two,Three,Four,Five
  greypic = Grey
  startpic = Start
  emptypic = Empty
  startdist = "**********","**********","**********","**********","..%&"
  neighbours = <neighbours_eight>
  randomfallpos = 1

  <<
    var kind_channel,start_channel,kind_perm,connect_perm;
    var start_val = 0 : reapply;
    var channel,perm;
    var pos_;
    var val0,val1,val2,val3;

    random_perm = {
      val0 = rnd(4);
      val1 = rnd(3);
      val2 = rnd(2);
      if val1>=val0 -> val1+=1;
      if val2>=val0 -> val2+=1;
      if val2>=val1 -> {val2+=1; if val2==val0 -> val2+=1;};
      val3 = 6-val0-val1-val2;
      perm = val0+4*val1+16*val2+64*val3;
    };

    random_channel = {
      channel = 1;
      if 1:2 -> channel*=4;
      if 1:2 -> channel*=16;
    };

    do_perm = { # applies perm to val0
      channel = 1;
      if val0%2 -> channel*=4;
      if val0>1 -> channel*=16;
      val0 = perm/channel%4;
    };

    global.init = {
      random_channel; kind_channel = channel;
      random_perm; kind_perm = perm;
      random_perm; connect_perm = perm;
      random_channel; start_channel = channel;
      start_val = rnd(4);
    };

    draw = {pos=pos_; *;};

    Kind_init = {
      val0 = kind-Two; perm=kind_perm@; do_perm;
      pos_ = (rnd(256).-(3*kind_channel@))+val0*kind_channel@;
    };

    Kind = draw;

    Kind_connect = {
      val0 = kind-Two; perm=connect_perm@; do_perm;
      switch {
        val0==0 -> inhibit=DIR_U+DIR_D+DIR_UL+DIR_DL+DIR_UR+DIR_DR;
        val0==1 -> inhibit=DIR_L+DIR_R+DIR_U+DIR_D;
        val0==2 -> inhibit=DIR_UL+DIR_DL+DIR_UR+DIR_DR;
        val0==3 -> inhibit=DIR_L+DIR_R+DIR_UL+DIR_DL+DIR_UR+DIR_DR;
      };
    };

    Start.init = {
      random_perm;
      behaviour .+= floats;
    };

    Start = {
      if !time -> {
        val0 = 19-loc_y; perm = perm@@(loc_x,19); do_perm;
        pos_ = val0;
        val0 = 19-loc_y; perm = perm@@(loc_x,18); do_perm;
        pos_ += 4*val0;
        val0 = 19-loc_y; perm = perm@@(loc_x,17); do_perm;
        pos_ += 16*val0;
        val0 = 19-loc_y; perm = perm@@(loc_x,16); do_perm;
        pos_ += 64*val0;
        if pos_/start_channel@%4 != start_val@ -> {kind=Empty; start_val=1;};
      };
      draw;
    };

    Grey.init = {
      pos_ = rnd(256).-(3*start_channel@);
      val0 = rnd(3);
      if val0>=start_val@ -> val0+=1;
      pos_ += val0*start_channel@;
    };

    Grey = draw;

    Empty = { if start_val -> draw; };

    Two.init = Kind_init;
    Three.init = Kind_init;
    Four.init = Kind_init;
    Five.init = Kind_init;

    Two = Kind;
    Three = Kind;
    Four = Kind;
    Five = Kind;

    Two.connect = Kind_connect;
    Three.connect = Kind_connect;
    Four.connect = Kind_connect;
    Five.connect = Kind_connect;

    info = {
      if version==0 -> A*
      else {
        E,E,E,E,E,E,E,E,E,
        F,F,F,F,F,F,F,F,F,
        M,M,M,M,M,M,M,M,M,
        N,N,N,N,N,N,N,N,N
      };
      *
    };
  >>

  Start = { pics = mseGG.xpm }

  Grey = { pics = mseGG.xpm }

  Empty = { pics = mseGG.xpm }

  Two = {
    pics = mseKind.xpm
    numexplode = 2
  }

  Three = {
    pics = mseKind.xpm
    numexplode = 3
  }

  Four = {
    pics = mseKind.xpm
    numexplode = 4
  }

  Five = {
    pics = mseKind.xpm
    numexplode = 5
  }

  info = {
    pics = infoicons.xpm
  }

}

