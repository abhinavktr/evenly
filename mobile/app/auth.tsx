import { Redirect } from 'expo-router';

// Target of the sign-in redirect (evenly://auth?code=…). The code itself is redeemed in
// AuthProvider; once signed in, this route just sends the user to the home tabs instead of
// the "Unmatched Route" screen.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
