// The vocabulary: which spells fill which role, and how each role is ranked. Data, not code —
// the predicate engine is roles.js and wants.js. Ported from the desktop tool's roles.yml and
// wants.yml, without their commentary.
//
//   roles   ranked kinds of spell: damage, heal, slow, haste… each with metrics, best first
//   wants   kinds of buff you want on you: strength, a resist, see invisible… ordered by size
//           where the number is a size, by level where it is not

export const SPEC = {
  "hunting_targets": {
    "undead": [
      10
    ],
    "summoned": [
      11
    ],
    "animal": [
      9
    ]
  },
  "recipient_classes": {
    "self": [
      6
    ],
    "single": [
      1,
      5,
      10,
      51,
      52,
      56
    ],
    "group": [
      3,
      41
    ],
    "pet": [
      14
    ]
  },
  "recipient_reaches": {
    "self": [
      "self"
    ],
    "single": [
      "single",
      "group",
      "self",
      "pet"
    ],
    "group": [
      "group",
      "single",
      "self",
      "pet"
    ],
    "pet": [
      "pet"
    ]
  },
  "burst_after_casts": 3,
  "roles": {
    "damage": {
      "label": "damage",
      "diversity": "resist",
      "metrics": [
        "dps",
        "dpm",
        "hit"
      ],
      "match": {
        "beneficial": false,
        "duration": "instant",
        "recast": "sustained",
        "slot": {
          "spa": 0,
          "sign": "negative"
        }
      },
      "exclude": {
        "target": "conditional"
      }
    },
    "burst": {
      "label": "burst damage",
      "classified_as": "damage",
      "diversity": "resist",
      "metrics": [
        "hit",
        "dpm"
      ],
      "match": {
        "beneficial": false,
        "duration": "instant",
        "recast": "burst",
        "slot": {
          "spa": 0,
          "sign": "negative"
        }
      },
      "exclude": {
        "target": "conditional"
      }
    },
    "dot": {
      "label": "damage over time",
      "diversity": "resist",
      "metrics": [
        "landed",
        "landed_per_mana",
        "dpm",
        "total",
        "dps"
      ],
      "match": {
        "beneficial": false,
        "duration": "finite",
        "slot": {
          "spa": 0,
          "sign": "negative"
        }
      },
      "exclude": {
        "target": "conditional"
      }
    },
    "song_damage": {
      "label": "song damage",
      "diversity": "none",
      "metrics": [
        "song_tick"
      ],
      "match": {
        "beneficial": false,
        "slot": {
          "spa": 334,
          "sign": "negative"
        }
      }
    },
    "heal": {
      "diversity": "none",
      "label": "heal",
      "metrics": [
        "hpm",
        "hps",
        "size"
      ],
      "match": {
        "beneficial": true,
        "duration": "instant",
        "slot": {
          "spa": 0,
          "sign": "positive"
        },
        "category_any": [
          "Heals",
          "Life Flow"
        ]
      },
      "exclude": {
        "target": [
          "pet",
          "group"
        ]
      }
    },
    "pet_heal": {
      "diversity": "none",
      "label": "pet heal",
      "metrics": [
        "hpm",
        "heal_total"
      ],
      "match": {
        "beneficial": true,
        "target_any": [
          "pet"
        ],
        "slot_any": [
          {
            "spa": 0,
            "sign": "positive"
          },
          {
            "spa": 100
          }
        ],
        "category_any": [
          "Heals"
        ]
      }
    },
    "hot": {
      "diversity": "none",
      "label": "heal over time",
      "metrics": [
        "hpm",
        "tick",
        "heal_total"
      ],
      "match": {
        "beneficial": true,
        "duration": "finite",
        "slot_any": [
          {
            "spa": 100
          },
          {
            "spa": 0,
            "sign": "positive"
          }
        ],
        "category_any": [
          "Duration Heals",
          "Regen",
          "Heals"
        ]
      },
      "exclude": {
        "target": [
          "pet"
        ]
      }
    },
    "slow": {
      "diversity": "none",
      "label": "slow",
      "metrics": [
        "strength"
      ],
      "match": {
        "beneficial": false,
        "slot": {
          "spa": 11,
          "base_below": 100
        }
      },
      "exclude": {
        "target": "conditional"
      }
    },
    "haste": {
      "diversity": "none",
      "label": "haste",
      "metrics": [
        "strength"
      ],
      "match": {
        "beneficial": true,
        "slot": {
          "spa": 11,
          "base_above": 100
        },
        "category_any": [
          "Haste"
        ]
      },
      "exclude": {
        "target": [
          "pet"
        ]
      }
    },
    "pet_haste": {
      "diversity": "none",
      "label": "pet haste",
      "metrics": [
        "strength"
      ],
      "match": {
        "beneficial": true,
        "slot": {
          "spa": 11,
          "base_above": 100
        },
        "target_any": [
          "pet"
        ]
      }
    },
    "resist_debuff": {
      "label": "resist debuff",
      "diversity": "resist",
      "metrics": [
        "debuff_total",
        "depth",
        "breadth"
      ],
      "match": {
        "beneficial": false,
        "slot_any": [
          {
            "spa": 46,
            "sign": "negative"
          },
          {
            "spa": 47,
            "sign": "negative"
          },
          {
            "spa": 48,
            "sign": "negative"
          },
          {
            "spa": 49,
            "sign": "negative"
          },
          {
            "spa": 50,
            "sign": "negative"
          }
        ],
        "category_any": [
          "Resist Debuffs"
        ]
      },
      "exclude": {
        "target": "conditional"
      }
    },
    "damage_shield": {
      "diversity": "none",
      "label": "damage shield",
      "metrics": [
        "size",
        "duration"
      ],
      "match": {
        "beneficial": true,
        "slot": {
          "spa": 59
        }
      }
    },
    "stat_tap_ac": {
      "diversity": "none",
      "label": "armor class tap/debuff",
      "metrics": [
        "swing_ac"
      ],
      "match": {
        "beneficial": false,
        "slot": {
          "spa": 1,
          "sign": "negative"
        },
        "category_any": [
          "Power Tap",
          "Disempowering"
        ]
      }
    },
    "stat_tap_atk": {
      "diversity": "none",
      "label": "attack rating tap/debuff",
      "metrics": [
        "swing_atk"
      ],
      "match": {
        "beneficial": false,
        "slot": {
          "spa": 2,
          "sign": "negative"
        },
        "category_any": [
          "Power Tap",
          "Disempowering"
        ]
      }
    },
    "stat_tap_str": {
      "diversity": "none",
      "label": "strength tap/debuff",
      "metrics": [
        "swing_str"
      ],
      "match": {
        "beneficial": false,
        "slot": {
          "spa": 4,
          "sign": "negative"
        },
        "category_any": [
          "Power Tap",
          "Disempowering"
        ]
      }
    }
  },
  "wants": {
    "max_hp": {
      "spa": [
        69
      ],
      "label": "max hp"
    },
    "armor_class": {
      "spa": [
        1
      ],
      "label": "armor class"
    },
    "regen": {
      "spa": [
        0
      ],
      "label": "health regen",
      "needs_duration": true
    },
    "damage_shield": {
      "spa": [
        59
      ],
      "label": "damage shield",
      "sign": "negative"
    },
    "rune": {
      "spa": [
        55
      ],
      "label": "damage absorb"
    },
    "strength": {
      "spa": [
        4
      ],
      "label": "strength"
    },
    "stamina": {
      "spa": [
        7
      ],
      "label": "stamina"
    },
    "agility": {
      "spa": [
        6
      ],
      "label": "agility"
    },
    "dexterity": {
      "spa": [
        5
      ],
      "label": "dexterity"
    },
    "charisma": {
      "spa": [
        10
      ],
      "label": "charisma"
    },
    "intelligence": {
      "spa": [
        8
      ],
      "label": "intelligence"
    },
    "wisdom": {
      "spa": [
        9
      ],
      "label": "wisdom"
    },
    "magic_resist": {
      "spa": [
        50
      ],
      "label": "magic resist"
    },
    "fire_resist": {
      "spa": [
        46
      ],
      "label": "fire resist"
    },
    "cold_resist": {
      "spa": [
        47
      ],
      "label": "cold resist"
    },
    "poison_resist": {
      "spa": [
        48
      ],
      "label": "poison resist"
    },
    "disease_resist": {
      "spa": [
        49
      ],
      "label": "disease resist"
    },
    "attack": {
      "spa": [
        2
      ],
      "label": "attack"
    },
    "melee_proc": {
      "spa": [
        85
      ],
      "label": "melee proc"
    },
    "singing_amplification": {
      "spa": [
        118
      ],
      "label": "singing amplification"
    },
    "mana_regen": {
      "spa": [
        15
      ],
      "label": "mana",
      "excludes_negative_hp": true
    },
    "hp_to_mana": {
      "spa": [
        15
      ],
      "label": "hp-to-mana conversion",
      "requires_negative_hp": true
    },
    "movement": {
      "spa": [
        3
      ],
      "label": "run speed"
    },
    "see_invisible": {
      "spa": [
        13
      ],
      "label": "see invisible"
    },
    "infravision": {
      "spa": [
        65
      ],
      "label": "infravision"
    },
    "ultravision": {
      "spa": [
        66
      ],
      "label": "ultravision"
    },
    "vision_range": {
      "spa": [
        87
      ],
      "label": "vision range"
    },
    "invisibility": {
      "spa": [
        12,
        28,
        29
      ],
      "label": "invisibility"
    },
    "levitate": {
      "spa": [
        57
      ],
      "label": "levitate"
    },
    "water_breathing": {
      "spa": [
        14
      ],
      "label": "enduring breath"
    },
    "see_through": {
      "spa": [
        73
      ],
      "label": "see through walls"
    },
    "model_size": {
      "spa": [
        89
      ],
      "label": "model size"
    },
    "dispel": {
      "spa": [
        27
      ],
      "label": "dispel"
    },
    "bind_affinity": {
      "spa": [
        25
      ],
      "label": "bind affinity"
    },
    "true_north": {
      "spa": [
        56
      ],
      "label": "true north"
    },
    "shadow_step": {
      "spa": [
        42
      ],
      "label": "shadow step"
    },
    "invulnerability": {
      "spa": [
        40
      ],
      "label": "invulnerability"
    },
    "pet_ward": {
      "spa": [
        163
      ],
      "label": "pet ward",
      "pet": true
    },
    "sense": {
      "spa": [
        52,
        53,
        54
      ],
      "label": "sense creatures"
    },
    "eye_of_zomm": {
      "spa": [
        67
      ],
      "label": "remote eye"
    },
    "pet_reclaim": {
      "spa": [
        68
      ],
      "label": "reclaim pet for mana",
      "pet": true
    },
    "instant_heal": {
      "spa": [
        79
      ],
      "label": "instant heal on cast"
    },
    "illusion": {
      "spa": [
        58
      ],
      "label": "illusion form"
    },
    "hate_on_attack": {
      "spa": [
        114
      ],
      "label": "extra hate on your attacks"
    },
    "spell_reflect": {
      "spa": [
        158
      ],
      "label": "spell reflect chance"
    },
    "endurance_regen": {
      "spa": [
        189
      ],
      "label": "endurance regen"
    },
    "recall_pet": {
      "spa": [
        103
      ],
      "label": "recall pet to you",
      "pet": true
    },
    "pet_size": {
      "spa": [
        298
      ],
      "label": "pet size",
      "pet": true
    },
    "cure_blindness": {
      "spa": [
        20
      ],
      "label": "cure blindness",
      "sign": "positive"
    },
    "gate": {
      "spa": [
        26
      ],
      "label": "gate"
    },
    "feign_death": {
      "spa": [
        74
      ],
      "label": "feign death"
    },
    "cure_disease": {
      "spa": [
        35
      ],
      "label": "cure disease",
      "sign": "negative"
    },
    "cure_poison": {
      "spa": [
        36
      ],
      "label": "cure poison",
      "sign": "negative"
    },
    "cure_curse": {
      "spa": [
        116
      ],
      "label": "cure curse",
      "sign": "negative"
    },
    "summon_item": {
      "spa": [
        32
      ],
      "label": "summon item"
    },
    "summon_armor": {
      "spa": [
        109
      ],
      "label": "summon armor set"
    },
    "summon_pet": {
      "spa": [
        33
      ],
      "label": "summon pet"
    },
    "summon_undead": {
      "spa": [
        71
      ],
      "label": "summon undead pet"
    }
  }
};
