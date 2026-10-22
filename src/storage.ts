import {openDB} from 'idb';
import {shoppingList} from './domain';
import type {Meal,Recipe,Settings} from './domain';
export type State={settings:Settings;recipes:Recipe[];plan:Meal[];checked:string[];pantry:string[];week:string};
const database=openDB('mealmate',1,{upgrade(db){db.createObjectStore('household');}});
export async function loadState():Promise<State|undefined>{return (await database).get('household','state');}
export async function saveState(state:State){await (await database).put('household',{...state,shoppingList:shoppingList(state.plan,state.recipes,state.settings.categories)},'state');}
