using System.Text.Json.Serialization;
using CinemaBookingSystem.Api.Data;
using CinemaBookingSystem.Api.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<CinemaDbContext>(options =>
    options.UseSqlite(
        builder.Configuration.GetConnectionString("CinemaDatabase")
        ?? "Data Source=cinema.db"));
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CinemaDbContext>();
    db.Database.EnsureCreated();

    if (!db.Showtimes.Any())
    {
        var tomorrow = DateTime.UtcNow.Date.AddDays(1);
        var showtimes = new[]
        {
            new Showtime
            {
                MovieId = 1,
                StartTime = tomorrow.AddHours(18),
                Auditorium = "Auditorium 1",
                AuditoriumType = "regular",
                Seats = CreateDemoSeats()
            },
            new Showtime
            {
                MovieId = 2,
                StartTime = tomorrow.AddHours(20).AddMinutes(30),
                Auditorium = "Auditorium 2",
                AuditoriumType = "regular",
                Seats = CreateDemoSeats()
            }
        };

        db.Showtimes.AddRange(showtimes);
        db.SaveChanges();
    }
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthorization();
app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy" }));

app.Run();

static List<Seat> CreateDemoSeats()
{
    return Enumerable.Range(1, 30)
        .Select(number => new Seat
        {
            Row = ((char)('A' + (number - 1) / 10)).ToString(),
            Number = (number - 1) % 10 + 1,
            Price = 10m,
            Status = SeatStatus.Available
        })
        .ToList();
}
