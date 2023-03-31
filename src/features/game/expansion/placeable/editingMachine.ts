import { v4 as uuidv4 } from "uuid";
import { GameEventName, PlacementEvent } from "features/game/events";
import { BuildingName } from "features/game/types/buildings";
import { CollectibleName } from "features/game/types/craftables";
import { assign, createMachine, Interpreter, sendParent } from "xstate";
import { Coordinates } from "../components/MapPlacement";
import Decimal from "decimal.js-light";
import { Inventory } from "features/game/types/game";

export interface Context {
  placeable: BuildingName | CollectibleName;
  action: GameEventName<PlacementEvent>;
  coordinates: Coordinates;
  collisionDetected: boolean;
  origin?: Coordinates;
  requirements: {
    sfl: Decimal;
    ingredients: Inventory;
  };
}

type UpdateEvent = {
  type: "UPDATE";
  coordinates: Coordinates;
  collisionDetected: boolean;
};

type PlaceEvent = {
  type: "PLACE";
  nextOrigin?: Coordinates;
  nextWillCollide?: boolean;
};

type ConstructEvent = {
  type: "CONSTRUCT";
  actionName: PlacementEvent;
};

export type BlockchainEvent =
  | { type: "DRAG" }
  | { type: "DROP" }
  | ConstructEvent
  | PlaceEvent
  | UpdateEvent
  | { type: "CANCEL" };

export type BlockchainState = {
  value: "idle" | "dragging" | "placed" | "close";
  context: Context;
};

export type MachineInterpreter = Interpreter<
  Context,
  any,
  BlockchainEvent,
  BlockchainState
>;

export const editingMachine = createMachine<
  Context,
  BlockchainEvent,
  BlockchainState
>({
  id: "placeableMachine",
  initial: "idle",
  preserveActionOrder: true,
  on: {
    CANCEL: {
      target: "close",
    },
  },
  states: {
    idle: {
      on: {
        UPDATE: {
          actions: assign({
            coordinates: (_, event) => event.coordinates,
            collisionDetected: (_, event) => event.collisionDetected,
          }),
        },
        DRAG: {
          target: "dragging",
        },
        PLACE: [
          {
            target: "idle",
            // They have more to place
            cond: (_, e) => {
              return !!e.nextOrigin;
            },
            actions: [
              sendParent(
                ({ placeable, action, coordinates: { x, y } }) =>
                  ({
                    type: action,
                    name: placeable,
                    coordinates: { x, y },
                    id: uuidv4().slice(0, 8),
                  } as PlacementEvent)
              ),
              assign({
                collisionDetected: (_, event) => !!event.nextWillCollide,
                origin: (_, event) => event.nextOrigin ?? { x: 0, y: 0 },
                coordinates: (_, event) => event.nextOrigin ?? { x: 0, y: 0 },
              }),
            ],
          },
          {
            target: "close",
            actions: sendParent(
              ({ placeable, action, coordinates: { x, y } }) =>
                ({
                  type: action,
                  name: placeable,
                  coordinates: { x, y },
                  id: uuidv4().slice(0, 8),
                } as PlacementEvent)
            ),
          },
        ],
      },
    },
    resetting: {
      always: {
        target: "idle",
        // Move the next piece
        actions: assign({
          coordinates: (context) => {
            return {
              x: context.coordinates.x,
              y: context.coordinates.y - 1,
            };
          },
        }),
      },
    },
    dragging: {
      on: {
        UPDATE: {
          actions: assign({
            coordinates: (_, event) => event.coordinates,
            collisionDetected: (_, event) => event.collisionDetected,
          }),
        },
        DROP: {
          target: "idle",
        },
      },
    },
    close: {
      type: "final",
    },
  },
});
