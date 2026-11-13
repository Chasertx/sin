using System.Globalization;
using Sin.Shared;

namespace Sin.Mobile;

public class IsNotNullOrEmptyConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is string s ? !string.IsNullOrWhiteSpace(s) : value is not null;
    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => throw new NotSupportedException();
}

public class IsNullOrEmptyConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is string s ? string.IsNullOrWhiteSpace(s) : value is null;
    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => throw new NotSupportedException();
}

public class InvertBoolConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) => value is not true;
    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => value is not true;
}

/// <summary>FlawCategory → "🚩 Dealbreaker"</summary>
public class CategoryLabelConverter : IValueConverter
{
    public static string Label(FlawCategory c) => c switch
    {
        FlawCategory.Habits => "🔁 Habits",
        FlawCategory.Baggage => "🧳 Baggage",
        FlawCategory.Hygiene => "🧼 Hygiene",
        FlawCategory.Money => "💸 Money",
        FlawCategory.Temper => "🌋 Temper",
        FlawCategory.Quirks => "🌀 Quirks",
        FlawCategory.Dealbreaker => "🚩 Dealbreaker",
        _ => "❓ Other",
    };

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is FlawCategory c ? Label(c) : "";
    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => throw new NotSupportedException();
}
