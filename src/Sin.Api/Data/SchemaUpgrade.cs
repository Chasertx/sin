using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Microsoft.EntityFrameworkCore.Storage;

namespace Sin.Api.Data;

/// <summary>
/// This project has no EF migrations: tables are created once, from the model, on an empty database.
/// A column added to the model later would never reach a database that already exists. This closes
/// that gap at startup by creating every table the model has and the database lacks, then adding
/// every column the model has and its table lacks.
/// Additive only: it never drops, renames or retypes anything. New columns on an existing table
/// must be nullable (existing rows get null).
/// </summary>
public static class SchemaUpgrade
{
    /// <summary>
    /// Creates whole tables (with their indexes and foreign keys) that were added to the model after
    /// the database was first set up. Built the same way EF builds a fresh database, limited to the
    /// tables that are missing.
    /// </summary>
    /// <returns>The names of the tables that were created.</returns>
    public static IReadOnlyList<string> CreateMissingTables(SinDb db)
    {
        var model = db.GetService<IDesignTimeModel>().Model;
        var missing = model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null)
            .Select(e => (Table: e.GetTableName()!, Schema: e.GetSchema()))
            .Distinct()
            .Where(t => ExistingColumns(db, t.Table, t.Schema).Count == 0)
            .ToHashSet();
        if (missing.Count == 0) return [];

        var operations = db.GetService<IMigrationsModelDiffer>()
            .GetDifferences(null, model.GetRelationalModel())
            .Where(op => op switch
            {
                CreateTableOperation t => missing.Contains((t.Name, t.Schema)),
                CreateIndexOperation i => missing.Contains((i.Table, i.Schema)),
                AddForeignKeyOperation f => missing.Contains((f.Table, f.Schema)),
                _ => false,
            })
            .ToList();
        var commands = db.GetService<IMigrationsSqlGenerator>().Generate(operations, model);
        db.GetService<IMigrationCommandExecutor>().ExecuteNonQuery(commands, db.GetService<IRelationalConnection>());
        return missing.Select(t => t.Table).Order().ToList();
    }

    /// <returns>The columns that were added, as "Table.Column".</returns>
    public static IReadOnlyList<string> AddMissingColumns(SinDb db)
    {
        var sql = db.GetService<ISqlGenerationHelper>();
        var added = new List<string>();

        foreach (var entity in db.GetService<IDesignTimeModel>().Model.GetEntityTypes())
        {
            if (entity.GetTableName() is not { } table) continue;
            var schema = entity.GetSchema();
            var existing = ExistingColumns(db, table, schema);
            if (existing.Count == 0) continue; // table isn't there at all

            var store = StoreObjectIdentifier.Table(table, schema);
            foreach (var property in entity.GetProperties())
            {
                if (property.GetColumnName(store) is not { } column || existing.Contains(column)) continue;
                if (!property.IsColumnNullable(store))
                    throw new InvalidOperationException(
                        $"{table}.{column} is new and not nullable. Make it nullable so existing rows can be upgraded.");

                // Every piece comes from our own model (no user input), and identifiers can't be parameters.
                var alter = $"ALTER TABLE {sql.DelimitIdentifier(table, schema)} ADD COLUMN {sql.DelimitIdentifier(column)} {property.GetColumnType(store)} NULL";
#pragma warning disable EF1002
                db.Database.ExecuteSqlRaw(alter);
#pragma warning restore EF1002
                added.Add($"{table}.{column}");
            }
        }
        return added;
    }

    private static HashSet<string> ExistingColumns(SinDb db, string table, string? schema)
    {
        var columns = db.Database.IsNpgsql()
            ? db.Database.SqlQueryRaw<string>(
                "select column_name::text as \"Value\" from information_schema.columns where table_schema = {0} and table_name = {1}",
                schema ?? "public", table)
            : db.Database.SqlQueryRaw<string>("select name as \"Value\" from pragma_table_info({0})", table);
        return columns.AsEnumerable().ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
