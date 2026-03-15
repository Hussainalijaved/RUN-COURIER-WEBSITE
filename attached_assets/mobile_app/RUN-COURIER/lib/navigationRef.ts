import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function navigateToJobOffers() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('HomeTab' as never);
  }
}
