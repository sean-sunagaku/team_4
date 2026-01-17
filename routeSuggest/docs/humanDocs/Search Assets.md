# search_assets.yaml（概念設計。実装ではJSON/DBでもOK）

common:
  radius_m: 3000            # 再検索しない前提で広め
  max_results: 25
  rank_preference: DISTANCE # 近い順がMVPでは扱いやすい
  field_mask:
    - places.displayName
    - places.location
    - places.types
    - places.formattedAddress
    - places.id

assets:
  BACK_PARKING:
    label_ja: "駐車（バック駐車）"
    includedTypes:
      - parking
      - convenience_store
      - supermarket
      - shopping_mall

  BASIC_START_STOP:
    label_ja: "発進・停車（基本操作）"
    includedTypes:
      - parking
      - convenience_store
      - supermarket

  U_TURN:
    label_ja: "Uターン（転回）"
    includedTypes:
      - gas_station
      - parking
      - convenience_store

  INTERSECTION_TURN:
    label_ja: "交差点（右左折）"
    # 交差点そのものを当てるのはMVPでは難しいので
    # 「目的地までの走行中に練習」＋「落ち着いて停車できる場所」を目的地にする
    includedTypes:
      - convenience_store
      - supermarket
      - parking

  MERGE_LANECHANGE:
    label_ja: "合流（車線変更）"
    # 同上：合流地点を直接ヒットさせない。走行中の練習として扱う
    includedTypes:
      - gas_station
      - convenience_store
      - parking

  NARROW_ROAD:
    label_ja: "細い道（狭路）"
    # 住宅街の狭い道はPlacesで直接検索しにくいので、
    # 近距離の目的地を置いて「途中を狭路練習」として成立させる
    includedTypes:
      - convenience_store
      - parking
      - supermarket
