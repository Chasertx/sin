using Android.App;
using Android.Content;
using Android.Content.PM;

namespace Sin.Mobile;

/// <summary>Receives the sin://auth redirect at the end of Google/Apple sign-in and hands it to WebAuthenticator.</summary>
[Activity(NoHistory = true, LaunchMode = LaunchMode.SingleTop, Exported = true)]
[IntentFilter([Intent.ActionView],
    Categories = [Intent.CategoryDefault, Intent.CategoryBrowsable],
    DataScheme = AuthConstants.CallbackScheme)]
public class WebAuthenticationCallbackActivity : WebAuthenticatorCallbackActivity
{
}
