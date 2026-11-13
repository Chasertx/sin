namespace Sin.Mobile;

public static class AppConfig
{
    /// <summary>
    /// Set this to your API's public https address (or your PC's LAN IP for quick tests)
    /// when you're not using an emulator or USB device. Leave null for the localhost default.
    /// </summary>
    private const string? Override = null;

    /// <summary>
    /// Every platform uses localhost by default:
    ///  - iOS simulator shares the Mac's network.
    ///  - Android emulator / USB phone: run  adb reverse tcp:5080 tcp:5080  once per boot.
    /// localhost (not 10.0.2.2) matters because Google only allows http redirect URLs on localhost.
    /// </summary>
    public static string ApiBaseUrl => Override ?? "http://localhost:5080/";
}

public static class AuthConstants
{
    /// <summary>Must match Sso:CallbackScheme on the API, the Android intent filter and the iOS URL type.</summary>
    public const string CallbackScheme = "sin";
    public static readonly Uri CallbackUri = new($"{CallbackScheme}://auth");
}
