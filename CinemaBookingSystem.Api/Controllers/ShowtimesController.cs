using CinemaBookingSystem.Api.Data;
using CinemaBookingSystem.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CinemaBookingSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShowtimesController(CinemaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult> GetShowtimes(CancellationToken cancellationToken)
    {
        var showtimes = await db.Showtimes
            .AsNoTracking()
            .Include(showtime => showtime.Movie)
            .Include(showtime => showtime.Seats)
            .OrderBy(showtime => showtime.StartTime)
            .ToListAsync(cancellationToken);

        return Ok(showtimes);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult> GetShowtime(int id, CancellationToken cancellationToken)
    {
        var showtime = await db.Showtimes
            .AsNoTracking()
            .Include(item => item.Movie)
            .Include(item => item.Seats)
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

        return showtime is null ? NotFound() : Ok(showtime);
    }

    [HttpPost]
    public async Task<ActionResult> CreateShowtime(
        CreateShowtimeRequest request,
        CancellationToken cancellationToken)
    {
        if (!await db.Movies.AnyAsync(movie => movie.Id == request.MovieId, cancellationToken))
        {
            return BadRequest($"Movie {request.MovieId} does not exist.");
        }

        var showtime = new Showtime
        {
            MovieId = request.MovieId,
            StartTime = request.StartTime.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(request.StartTime, DateTimeKind.Utc)
                : request.StartTime.ToUniversalTime(),
            Auditorium = request.Auditorium ?? string.Empty,
            AuditoriumType = request.AuditoriumType?.Equals("vip", StringComparison.OrdinalIgnoreCase) == true
                || request.Auditorium?.Contains("VIP", StringComparison.OrdinalIgnoreCase) == true
                ? "vip"
                : "regular"
        };

        var seats = request.Seats?.Count > 0
            ? request.Seats
            : Enumerable.Range(1, 30)
                .Select(number => new CreateSeatRequest(
                    ((char)('A' + (number - 1) / 10)).ToString(),
                    (number - 1) % 10 + 1,
                    10m))
                .ToList();

        showtime.Seats = seats.Select(seat => new Seat
        {
            Row = seat.Row,
            Number = seat.Number,
            Price = seat.Price,
            Status = SeatStatus.Available
        }).ToList();

        db.Showtimes.Add(showtime);
        await db.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetShowtime), new { id = showtime.Id }, showtime);
    }
}

public sealed record CreateShowtimeRequest(
    int MovieId,
    DateTime StartTime,
    string? Auditorium,
    List<CreateSeatRequest>? Seats,
    string? AuditoriumType = null);

public sealed record CreateSeatRequest(string Row, int Number, decimal Price);
