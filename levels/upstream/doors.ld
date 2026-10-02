#
#   Copyright <=2004 by Immanuel Halupczok
#   Modified 2014 by Immanuel Halupczok
#   Maintenance modifications 2005,2006,2011,2014 by the cuyo developers
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
# The above notices apply to this file and to:
#   ilBlase.xpm[.gz], ilDing.xpm[.gz], ilElefant2.xpm[.gz], ilElefant.xpm[.gz],
#   ilKlavier.xpm[.gz], ilRolefant2.xpm[.gz], ilRolefant.xpm[.gz],
#   ilTuer.xpm[.gz], ilVogelL.xpm[.gz], ilVogelR.xpm[.gz]
#


Doors = {
  name="Doors"
  author="Immi"
  description="It was late and I was tired"
  numexplode=6
  # elefant, rolefant und bilefant müssen in dieser Reihenfolge
  # beisammen bleiben, damit der Vogel sie fressen kann
  # Außerdem muss die Reihenfolge der Dinge der Reihenfolge
  # der pics bei der Tür entsprechen.
  pics=blase,ding,elefant,rolefant,bilefant
  startpic=tuer
  startdist="AB......AB",
            "AB......AB",
	    "AB......AB",
	   "AB-....-AB"
  startdist[1]="AB..AB..AB",
               "AB..AB..AB",
	       "AB..AB..AB",
	       "AB-.AB.-AB"
  greypic=vogel
  emptypic=leer
  bgcolor=45,45,80
  topcolor=45,45,80
  chaingrass=0
  randomgreys[1]=100
  toptime=40
  toppic=ilKlavier.xpm
  topoverlap=10
  
  
  <<
  
  var tuer_li, tuer_mi, tuer_re, flutschri;
  # fressen:
  # - bei Elefanten: wenn der Elefant gefressen wird
  # - bei Vögeln: Was er am Fressen ist
  # - bei Blasen: Wenn sie einen Vogel gefressen hat
  # - bei leer, wenn blubber = 1: Wenn ein Vogel in der Blase ist
  var fressen;

  var zw;
        
  # Für ding. Wird aber auch von vogel gebraucht
  # Und von tuer
  var ding_hier = -1, ding_ob = -1, ding_li = -1;
  
  # Für Vogel. Wird aber auch von Ding abgefragt.
  var beschaeftigt;

  # 0: Links, 1: Rechts
  var vogel_seite;

  var li, re;
  var blubber;
  var aufblas_blase;
  
  var platz;
  var stueck;



  # Initialisiert alle Variablen, die für ein neu erzeugtes
  # Objekt initialisiert sein sollten.
  init_alles_l = {
    # Für diverses
    fressen@(-1,0) = 0;
    # Für Blase
    platz@(-1,0) = 0; stueck@(-1,0) = 0;
    aufblas_blase@(-1,0) = 0; blubber@(-1,0) = 0;
    # Für Ding
    ding_ob@(-1,0) = -1; ding_li@(-1,0) = -1;
  };
  init_alles_r = {
    # Für diverses
    fressen@(1,0) = 0;
    # Für Blase
    platz@(1,0) = 0; stueck@(1,0) = 0;
    aufblas_blase@(1,0) = 0; blubber@(1,0) = 0;
    # Für Ding
    ding_ob@(1,0) = -1; ding_li@(1,0) = -1;
  };
  init_alles_o = {
    # Für diverses
    fressen@(0,-1) = 0;
    # Für Blase
    platz@(0,-1) = 0; stueck@(0,-1) = 0;
    aufblas_blase@(0,-1) = 0; blubber@(0,-1) = 0;
    # Für Ding
    ding_ob@(0,-1) = -1; ding_li@(0,-1) = -1;
  };

  
  semiglobal={
    # Dinge dürfen nur abwechselnd links oder rechts
    # flutschen, damit es keine Kollisionen gibt
    flutschri = 0, flutschri = 1;
    
    tuer_li = 0;
    tuer_mi = 0;
    tuer_re = 0;
    switch {
      1:150 => {
          B, B, C, C, D, E, D, D, D, D, D, D, C, C, B, B;
	  tuer_li = 2 * pos;
        };
    };
    switch {
      1:150 => {
          B, B, C, C, D, E, D, D, D, D, D, D, C, C, B, B;
	  tuer_mi = 2 * pos;
        };
    };
    switch {
      1:50 => {
          B, B, C, C, D, E, D, D, D, D, D, D, C, C, B, B;
	  tuer_re = 2 * pos;
        };
    };
  };
  
  
  
  
  fant_blink={
    switch {
      falling_fast -> 2;
      1:200 => 2,2,1,1,1,2,2;
      -> 1;
    };
  };
    
  fant={
    fant_blink;
    schema16;
  };
  
  fant_rutsch={
    switch {
      # Links-Rutsch testen
      1:2 -> switch {
	kind@(0,1) == blase &&
	  kind@(-1,0) == nothing &&
          kind@(-1,1) == nothing -> {
            kind@(-1,0) = kind;
	    init_alles_l;
	    kind = nothing;
          };
      };  # Ende von Linksrutsch
      # Rechts-Rutsch testen
      -> switch {
	kind@(0,1) == blase &&
	  kind@(1,0) == nothing &&
          kind@(1,1) == nothing -> {
            kind@(1,0) = kind;
	    init_alles_r;
	    kind = nothing;
          };
      };  # Ende von Rechtsrutsch
    };  # Ende von switch
  };

  fant_blas={
    switch {
      0?1?0?0? && kind@(0,-1) == nothing && 1:50 => {
        {
	  kind@(0,-1) = blase;
	  init_alles_o;
	  aufblas_blase@(0,-1) = 1;
	  0L*
	},
	0L*, 0L*, 0R*, 0R*, 0R*, 0R*, 0R*, 0R*
      };
    };
  };
  
  gesamt_fant={
    switch {
    
      # Gefressen werden?
      fressen => {
	[qu=Q_TL_BL] 1*;
	[qu=Q_TR_BR] 1*;
	{}, {kind=nothing};
      };
    
      # Zu Bilefant werden? (Wenn drunter noch eine fant-paarung
      # ist, die Bilefant werden kann, dann werden wir nicht zum
      # Bilefant.)
      kind@(0,1) == elefant + rolefant - kind && kind@(0,2) != kind -> {
	{
	  1*;
	}, {
	  [qu = Q_TL_BL] 1*;
	  [qu = Q_TR_BR] 1*;
	  kind@(0,1) = bilefant;
	  kind@(0,0) = nothing;
	}
      };
      
      # Nicht zu Bilefant werden
      -> {
        fant;
	fant_blas;
	fant_rutsch;
      };  # Ende von nicht zu Bilefant werden
      
    };  # Ende von switch
  };  # Ende von gesamt_fant
  >>
  
  leer={
    pics=ilBlase.xpm,ilVogelL.xpm,ilVogelR.xpm

    <<
    leer= if blubber => {
      zw = 0;
      {
        switch {fressen => {
	  file = vogel_seite + 1; [qu=Q_TL_BL] *; [qu=Q_TR_BR] *; 0;
	}; };
        [qu=Q_TL_BL] *; [qu=Q_TR_BR] *;
      }, {
        zw = 1;
        if fressen => { file = vogel_seite + 1; *; 0 };
	*;
	blubber@(0,-1) = 1;
	fressen@(0,-1) = fressen;
	vogel_seite@(0,-1) = vogel_seite;
      }, {
	zw = 1;
        switch {fressen => {
	  file = vogel_seite + 1; [qu=Q_BL_TL] *; [qu=Q_BR_TR] *; 0;
	}; };
        [qu=Q_BL_TL] *; [qu=Q_BR_TR] *;
	blubber = 0;
      };

      switch {
        kind@(0,-1) != leer && kind@(0,-1) != outside && fressen -> {
          # Obendrüber kommt was. Dann lieber unseren Vogel freilassen.
          fressen = 0;
	  kind = vogel;
        };
	kind@(0,-1) == vogel && !fressen -> {
	  # Oben ein Vogel, und wir haben hunger...
	  fressen = 1;
	  vogel_seite = vogel_seite@(0,-1);
	  kind@(0,-1) = nothing;
	  if zw -> {
	    # Das obendran muss auch wissen, dass es gefressen hat
	    fressen@(0,-1) = 1;
	    # Und überhaupt: Vielleicht hat der Vogel das Blop obendran
	    # kaputt gemacht. Dann müssen wir ihm neu mitteilen, dass
	    # es blubbert
	    blubber@(0,-1) = 1;
	  };
	};
      };
      
      


    };
    >>
  }

  tuer={
    pics=ilTuer.xpm,
         ilBlase.xpm, ilDing.xpm, ilElefant.xpm, ilRolefant.xpm
    <<
    var komm_raus;
    var komm_was;
    var geh_weg;

    # Der Elefant, der aus der Tür kommt, wird wirklich
    # zum Elefant.
    werde_echt = {
      kind = komm_was;
    };
    
    # Setzt file und pos auf das, was aus der Tür kommt
    setz_komm_fp = {
      file = komm_was + 1;
      if (komm_was == ding) -> pos = ding_hier
      else A;
    };
    
    tuer = {
      if informational -> {
        if 1:150 => {
          B, B, C, C, D, D, D, D, D, D, D, D, C, C, B, B;
        } else -> {A};
        pos += 32; *;

      } else if version == 2 -> {
        {},
        {
	  setz_komm_fp;
	  [qu=Q_TL_TR] *; [qu=Q_BL_BR] *;
	  werde_echt;
	}

      } else if version == 3 -> {
        {
	  setz_komm_fp;
	  [qu=Q_TR_TL] *; [qu=Q_BR_BL] *;
	  werde_echt;
	}
	
      } else => {
	switch {
          ????0??? -> Y;
	  0??????? -> A;
	  kind@(0,2) != tuer -> Q;
	           -> I;
	};
	switch {
          loc_x >= 7 -> zw = tuer_re@@;
          loc_x >= 4 -> zw = tuer_mi@@;
                     -> zw = tuer_li@@;
	};
	if zw == 8 -> pos += 6
	else       -> pos += zw;
	pos += version;
	*;

	if zw == 8 && ??111??? && version == 0 &&
            (kind@(0,2) != tuer || kind@(1,2) != tuer) -> {
          komm_raus@(0,0) = 1;
	  komm_raus@(1,0) = 1;
          komm_was = rnd(4);
	  ding_hier = rnd(6);
	  komm_was@(1,0) = komm_was;
	  ding_hier@(1,0) = ding_hier;
	  geh_weg@(0,0) = 0;
	  geh_weg@(1,0) = 0;
	};

        # Alles, was jetzt noch gemalt wird, ist das, was rauskommt.
	# Dafür file und pos setzen.
        setz_komm_fp;

	if komm_raus => {
          komm_raus = 0;
          switch {
	    version == 0 => {
	      {},
	      { [qu=Q_TL_TR] *; [qu=Q_BL_BR] *; },
	      { [qu=Q_TL_TR] *; [qu=Q_BL_BR] *; },
	      {
		if kind@(-1,0) == nothing => {
		  {
  		    [qu=Q_TL_TR] *; [qu=Q_BL_BR] *;
		    kind@(-1,0) = tuer;
                    behaviour@(-1,0) .-= goalblob; # damit nicht kurzzeitig mehr Gras angezeigt wird
		    init_alles_l;
		    version@(-1,0) = 2;
         	    komm_was@(-1,0) = komm_was;
	            ding_hier@(-1,0) = ding_hier;
		    # Nicht zurück in die Tür gehen oder
		    # zur anderen Seite raus:
		    geh_weg@(1,0) = -1;
		  },
		  { * },
		  {[qu=Q_TR_TL] *; [qu=Q_BR_BL] *; }
		} else => {
		  # Nach rechts. (Entweder in die Tür oder abhauen.)
  		  [qu=Q_TL_TR] *; [qu=Q_BL_BR] *;
		};
	      }
	    }; # version == 0
	    version == 1 => {
	      { [qu=Q_TL_TL] *; [qu=Q_BL_BL] *; },
              { [qu=Q_TR_TL] *; [qu=Q_BR_BL] *; },
              { [qu=Q_TR_TL] *; [qu=Q_BR_BL] *; },
              { [qu=Q_TR_TL] *; [qu=Q_BR_BL] *; },
	      {
		if geh_weg == 0 => {
		  # Elefant haut nicht nach links ab
		  if kind@(1,0) == nothing => {
		    {
		      kind@(1,0) = tuer;
                      behaviour@(1,0) .-= goalblob; # damit nicht kurzzeitig mehr Gras angezeigt wird
		      init_alles_r;
		      version@(1,0) = 3;
            	      komm_was@(1,0) = komm_was;
	              ding_hier@(1,0) = ding_hier;
		      *;
		    },
		    { [qu=Q_TL_TR] *; [qu=Q_BL_BR] *; }
		  } else => {
		    # Zurück in die Tür
  	            [qu=Q_TL_TL] *; [qu=Q_BL_BL] *;
		  };
		};
	      }
	    }; # version == 1
	  }; # switch
	}; # Ende von komm_raus
      }; # Ende von version == 0 oder 1
    };
    >>
  } # tuer
  
  elefant={
    pics=ilBlase.xpm,ilElefant.xpm,ilElefant2.xpm
    
    <<
    elefant=gesamt_fant;
    >>
  }
  
  rolefant={
    pics=ilBlase.xpm,ilRolefant.xpm,ilRolefant2.xpm
    <<
    rolefant=gesamt_fant;
    >>
  }
  
  bilefant={
    pics=ilBlase.xpm,ilElefant.xpm,ilElefant2.xpm,ilRolefant.xpm,ilRolefant2.xpm
    <<
    # Von oben sollen keine bilefanten kommen. Aber ein bisschen mehr
    # Dinge könnten wir brauchen.
    bilefant.init={
      kind = ding;
      ding_hier = rnd(6);
    };
    
    bilefant={
      switch {
        fressen => {
	  [qu=Q_TL_BL] 1*;
	  [qu=Q_TR_BR] 3*;
	  {}, {kind=nothing};
	};
	-> {
	  switch {
	    0?0?0?0? -> A;
	    0?1?0?0? -> B;
	    0?1?0?1? -> C;
	    0?0?0?1? -> D;
	    0?0?1?0? -> E;
	    0?1?1?0? -> F;
	    0?1?1?1? -> G;
	    0?0?1?1? -> H;
	    1?0?1?0? -> I;
	    1?1?1?0? -> J;
	    1?1?1?1? -> K;
	    1?0?1?1? -> L;
	    1?0?0?0? -> M;
	    1?1?0?0? -> N;
	    1?1?0?1? -> O;
	    1?0?0?1? -> P;
	  };
	  fant_blink;
	  [qu=Q_TL] *; [qu=Q_BR] *;
	  file += 2;
	  [qu=Q_TR] *; [qu=Q_BL] *;

	  fant_blas;
	  fant_rutsch;
        };
      };
    };
    >>
  } # bilefant
  
  blase={
    pics=ilBlase.xpm, ilVogelL.xpm, ilVogelR.xpm
    
    <<
    var ki;
    
    blase={
      # Befindet sich ein Vogel in uns?
      if !aufblas_blase && fressen && !blubber -> {
        file=vogel_seite + 1;
	A*;
	0
      };
      
      switch {
        aufblas_blase => {
	  { aufblas_blase = 0 },
	  {}, O*, O*, O*, U*, U*, U*;
	};
        platz -> {
          F,L,F,
	  {
	    L;
	    switch {
	      fressen -> kind@(0,0)=vogel;
	              -> kind@(0,0)=nothing;
	    };
	  };
          pos += platz;*;
        };
	blubber -> {
	  if fressen -> {
	    file = vogel_seite + 1;
            [qu=Q_BL_TL] *;
            [qu=Q_BR_TR] *;
	    0;
	  };
          [qu=Q_BL_TL] *;
          [qu=Q_BR_TR] *;
	  blubber = 0;
	  kind = nothing;
	};
        -> {
          pos = stueck; *;

          ki = 0;
          switch {
            stueck == 2 -> ki = kind@(-1,0) == blase && stueck@(-1,0) == 1;
            stueck == 5 -> ki = kind@(-1,0) == blase && stueck@(-1,0) == 4;
            stueck == 6 -> ki = kind@(0,-1) == blase && stueck@(0,-1) == 3;
            stueck == 7 -> ki = kind@(0,-1) == blase && stueck@(0,-1) == 4;
            stueck == 8 -> ki = kind@(-1,-1) == blase && stueck@(-1,-1) == 4;
            stueck == 4 && 1:150 -> {
              platz@(0,0) = 4; platz@(1,0) = 5;
              platz@(0,1) = 7; platz@(1,1) = 8;
            };
	    stueck == 0 && !falling && 1:100 && kind@(0,-1) == nothing -> {
	      blubber@(0,-1) = 1;
	      fressen@(0,-1) = fressen;
	      vogel_seite@(0,-1) = vogel_seite;
	      blubber = 1;
	    };
          };
          switch {
            !ki -> {
              switch {
                ??0?0??? -> {stueck = 0;};
                ??111??? -> {stueck = 4; stueck@(1,0) = 5;
                             stueck@(0,1) = 7; stueck@(1,1) = 8;};
                ??1?0??? -> {stueck = 1; stueck@(1,0) = 2;};
                ????1??? -> {stueck = 3; stueck@(0,1) = 6;};
              }
            };
          };
        }; # ende von: nicht platzend
      };
      
      
      # Wollen wir uns einen Vogel unter uns einverleiben?
      switch {
        kind@(0,1) == vogel && !fressen && !platz && !blubber -> {
	  fressen = 1;
	  kind@(0,1) = nothing;
	  vogel_seite = vogel_seite@(0,1);
	};
      };
    };
    >>
  } # blase
  
  ding={
    pics=ilDing.xpm
    numexplode=9
    <<
    
    ding.init={
      ding_hier = rnd(6);
    };
    
    ding={
    
      # Malen: hier
      if ding_hier != -1 -> {
        pos=ding_hier; *;
      };
      # Malen: oben
      if ding_ob != -1 -> {
        pos=ding_ob;
	[qu=Q_BL_TL] *;
	[qu=Q_BR_TR] *;
      };
      # Malen: unten
      if (kind@(0,1) == ding || kind@(0,1) == vogel) && ding_ob@(0,1) != -1 -> {
        pos=ding_ob@(0,1);
	[qu=Q_TL_BL] *;
	[qu=Q_TR_BR] *;
      };
      # Malen: links
      if ding_li != -1 -> {
        pos=ding_li;
	[qu=Q_TR_TL] *;
	[qu=Q_BR_BL] *;
      };
      # Malen: rechts
      if (kind@(1,0) == ding || kind@(1,0) == vogel) && ding_li@(1,0) != -1 -> {
        pos=ding_li@(1,0);
	[qu=Q_TL_TR] *;
	[qu=Q_BL_BR] *;
      };

      # Wenn ich nix mehr bin, dann bin ich nicht mehr
      if ding_hier == -1 && ding_ob == -1 && ding_li == -1 &&
         (kind@(1,0) != ding && kind@(1,0) != vogel || ding_li@(1,0) == -1) &&
         (kind@(0,1) != ding && kind@(0,1) != vogel || ding_ob@(0,1) == -1) ->
        kind = nothing;
      
      

      # Nach unten rausfallen
      if ding_hier != -1 && ding_ob@(0,1) == -1 && (
               kind@(0,1) == ding ||
	       kind@(0,1) == vogel && !beschaeftigt@(0,1)
             ) -> {
        ding_ob@(0,1) = ding_hier; ding_hier = -1;
        # Wenn wir einen Vogel fuettern, muessen wir das weight behalten.
        if kind@(0,1) != vogel -> {
          weight@(0,1) += 1; weight@(0,0) -= 1;
        };
      };
      
      # Von oben reinfallen:
      if ding_hier == -1 -> {
        ding_hier = ding_ob; ding_ob = -1;
      };
      
      # flutschen (schräg) (schräg geflutscht wird nur, wenn beide
      # Dinge auf dem boden liegen.)
      if ding_ob != -1 && kind@(0,1) != nothing -> {
        # nach links flutschen
	if flutschri@@ && ding_li == -1 && kind@(-1,1) != nothing && (
	         kind@(-1,0) == ding ||
		 kind@(-1,0) == vogel && !beschaeftigt@(-1,0)
	       ) -> {
	  ding_li = ding_ob;
	  ding_ob = -1;
	};
	# nach rechts flutschen
	if !flutschri@@ && ding_li@(1,0) == -1 && kind@(1,1) != nothing && (
	          kind@(1,0) == ding ||
		  kind@(1,0) == vogel && !beschaeftigt@(1,0)
		) -> {
          ding_li@(1,0) = ding_ob; ding_ob = -1;
          # Wenn wir einen Vogel fuettern, muessen wir das weight behalten.
          if kind@(1,0) != vogel -> {
            weight@(1,0) += 1; weight@(0,0) -= 1;
          };
	};
      };

      # Halbe Dinge abschneiden
      if kind@(0,-1) != ding && ding_ob != -1 -> {
	ding_ob = -1;
        weight -= 1;
      };
      if kind@(-1,0) != ding && kind@(-1,0) != vogel && ding_li != -1 -> {
	ding_li = -1;
        weight -= 1;
      };
    };
    >>
  } # ding
  
  vogel={
    pics=ilVogelL.xpm,ilVogelR.xpm,ilDing.xpm
    
    <<
    vogel.init={
      vogel_seite = rnd(2);
    };
    
    
    vogel={
      
      switch {
        ding_ob != -1 -> {
	    # Vogel wird von oben bedrängt
	    beschaeftigt = 1;
	    ding_li = -1;
	    ding_li@(1,0) = -1;
            2;
            pos=ding_ob;
	    [qu=Q_BL_TL] *;
	    [qu=Q_BR_TR] *;
	    file = vogel_seite; K*;
	  };
        ding_li != -1 -> {
	    # Vogel wird von links bedrängt
	    beschaeftigt = 1;
	    vogel_seite = 0;
	    ding_ob = -1;
	    ding_li@(1,0) = -1;
            2;
            pos=ding_li;
	    [qu=Q_TR_TL] *;
            [qu=Q_BR_BL] *;
	    0I*;
	  };
        kind@(1,0) == ding && ding_li@(1,0) != -1 -> {
	    # Vogel wird von rechts bedrängt
	    beschaeftigt = 1;
	    vogel_seite = 1;
	    ding_ob = -1;
	    ding_li = -1;
            2;
	    pos=ding_li@(1,0);
	    [qu=Q_TL_TR] *;
	    [qu=Q_BL_BR] *;
	    1I*;
	  };
        kind@(0,-1) >= elefant && kind@(0,-1) <= bilefant  => {
	    beschaeftigt = 1;
	    file = vogel_seite;
	    B*, B*, C*, C*,
            {
	      D*;
	      fressen@(0,-1) = 1;
	      fressen = kind@(0,-1)
	    },
	    {
	      E, E, F, F;
	      switch {
		fressen == elefant -> *;
		fressen == rolefant -> {pos += 2; *};
		-> {
		  # Pos E soll zu G werden; F soll bleiben:
		  pos = 10 - pos;
		  [qu=Q_TL] *;
		  [qu=Q_BR] *;
		  # G (6) -> E (4), F (5) -> H (7)
		  pos = 22 - 3 * pos;
		  [qu=Q_TR] *;
		  [qu=Q_BL] *;
		};
	      }
	    },
	    C*, C*, B*, B*, A*, A*;
	  };
	-> {
	    file = vogel_seite;
	    beschaeftigt = 0;
	    A*;
	  };
      };

      # Halbe Dinge abschneiden
      if kind@(0,-1) != ding -> {
	ding_ob = -1;
      };
      if kind@(-1,0) != ding && kind@(-1,0) != vogel -> {
	ding_li = -1;
      };


    };
    >>
  } # vogel
}
