import { merge, map, groupBy, sortBy, filter } from 'lodash';
import Vue from 'vue';
import Vuex from 'vuex';
import { computed, Ref } from '@vue/composition-api';

import { configStore } from './config';
import { dialogStore } from './dialog';
import { snackBarStore } from './snackBar';
import { addFormStore } from './addForm';
import { AllStateTypes } from '../consts';
import { torrentIsState } from '../utils';
import searchEngineStore from './searchEngine';
import { RootState } from './types';
import api from '@/Api';
import { Torrent } from '@/types';
import stateMerge from 'vue-object-merge';

Vue.use(Vuex);

const store = new Vuex.Store<RootState>({
  modules: {
    config: configStore,
    dialog: dialogStore,
    snackBar: snackBarStore,
    addForm: addFormStore,
    searchEngine: searchEngineStore,
  },
  state: {
    rid: 0,
    mainData: undefined,
    preferences: null,
    pasteUrl: null,
    needAuth: false,
  },
  mutations: {
    /* eslint-disable no-param-reassign */
    updateMainData(state, payload) {
      state.rid = payload.rid;
      delete payload.rid;
      if (payload.full_update) {
        delete payload.full_update;
        state.mainData = payload;
      } else {
        const mainData = state.mainData;
        if (payload.torrents_removed) {
          for (const hash of payload.torrents_removed) {
            Vue.delete(mainData!.torrents, hash)
          }
          delete payload.torrents_removed;
        }
        if (payload.categories_removed) {
          for (const key of payload.categories_removed) {
            Vue.delete(mainData!.categories, key)
          }
          delete payload.categories_removed;
        }
        stateMerge(mainData, payload)
      }
    },
    updatePreferences(state, payload) {
      state.preferences = payload;
    },
    setPasteUrl(state, payload) {
      const { url } = payload;
      state.pasteUrl = url;
    },
    updateNeedAuth(state, payload) {
      state.needAuth = payload;
    },
    /* eslint-enable no-param-reassign */
  },
  getters: {
    allPreferences(state) {
      return state.preferences;
    },
    savePath(state) {
      return state.preferences['save_path'];
    },
    isDataReady(state) {
      return !!state.mainData;
    },
    allTorrents(state) {
      if (!state.mainData) {
        return [];
      }

      const torrents = map(state.mainData.torrents, (value, key) => {
        Vue.set(value, 'hash', key)
        return value as Torrent
      });
      if (process.env.VUE_APP_IGNORE_HIDDEN_CATEGORIE === 'YES') {
        return filter(torrents, it => !it.category.startsWith('.'))
      }
      return torrents
    },
    allCategories(state) {
      if (!state.mainData) {
        return [];
      }

      let categories = map(state.mainData.categories,
        (value, key) => merge({}, value, { key }));
      if (process.env.VUE_APP_IGNORE_HIDDEN_CATEGORIE === 'YES') {
        categories = filter(categories, it => !it.name.startsWith('.'))
      }
      return sortBy(categories, 'name');
    },
    torrentGroupByCategory(state, getters) {
      return groupBy(getters.allTorrents, torrent => torrent.category);
    },
    torrentGroupBySite(state, getters) {
      return groupBy(getters.allTorrents, (torrent) => {
        if (!torrent.tracker) {
          return '';
        }

        const url = new URL(torrent.tracker);
        return url.hostname;
      });
    },
    torrentGroupByState(__, getters) {
      const result: any = {};
      const put = (state: any, torrent: any) => {
        let list: any[] = result[state];
        if (!list) {
          list = [];
          result[state] = list;
        }
        list.push(torrent);
      };

      for (const torrent of getters.allTorrents) {
        for (const type of AllStateTypes) {
          if (torrentIsState(type, torrent.state)) {
            put(type, torrent);
          }
        }
      }

      return result;
    },
  },
  actions: {
    async updatePreferencesRequest({ dispatch }, preferences) {
      try {
        await api.setPreferences(preferences);
        //setPreference api return a empty response. Need to update preference by another request.
        const preferenceRes = await api.getAppPreferences();
        dispatch("updatePreferencesRequestSuccess", preferenceRes.data);
      } catch {
        dispatch("updatePreferencesRequestFailure");
      }
    },
    updatePreferencesRequestSuccess({ commit }, preferences) {
      commit("updatePreferences", preferences);
    },
    updatePreferencesRequestFailure() {
      alert('Preferences failed to update');
    },
  },
});

export default store;

export function useStore() {
  return store;
}

export function useMutations(mutations: [string], namespace?: string) {
  const result: {[key: string]: () => any} = {};

  mutations.forEach((m) => {
    const method = namespace ? `${namespace}/${m}` : m;
    result[m] = (..._args) => store.commit(method, ..._args);
  });

  return result;
}

export function useState(states: [string], namespace?: string) {
  const state = namespace ? (store.state as any)[namespace] : store.state;

  const result: {[key: string]: Readonly<Ref<Readonly<any>>>} = {};

  states.forEach((s) => {
    result[s] = computed(() => state[s]);
  });

  return result;
}
