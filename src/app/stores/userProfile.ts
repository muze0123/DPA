import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface UserCenterProfile {
  displayName: string;
  avatarUrl: string | null;
}

export const useUserProfileStore = defineStore('user-profile', () => {
  // Local prototype data; replace this value from TianShu's user-center response.
  const profile = ref<UserCenterProfile>({ displayName: '张三', avatarUrl: null });

  function setUserCenterProfile(next: UserCenterProfile) {
    profile.value = next;
  }

  return { profile, setUserCenterProfile };
});
