/**
 * ルート提案型定義
 */

import type { Coordinates, SelectedPOI } from './poi.js';
import type { PracticeType } from './practice.js';

export interface RouteConstraints {
  avoidHighways?: boolean;
  avoidTolls?: boolean;
}

export interface Waypoint {
  name: string;
  address: string;
  location: Coordinates;
}

export interface RouteSuggestion {
  googleMapsUrl: string;
  steps: string[];
  notes: string[];
  waypoints: Waypoint[];
  destination: Waypoint;
  practiceType: PracticeType;
  origin: {
    address: string;
    location: Coordinates;
  };
}

export interface AIRouteSelection {
  waypointIds: string[];
  destinationId: string;
  steps: string[];
  notes: string[];
}

export interface RouteGenerationContext {
  origin: {
    address: string;
    location: Coordinates;
  };
  practiceType: PracticeType;
  candidates: SelectedPOI[];
  constraints?: RouteConstraints;
}
