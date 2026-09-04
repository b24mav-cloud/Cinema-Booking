using CinemaBookingSystem.Api.Data;
using CinemaBookingSystem.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CinemaBookingSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BookingsController(CinemaDbContext db) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Booking>> GetBooking(Guid id, CancellationToken cancellationToken)
    {
        var booking = await db.Bookings
            .AsNoTracking()
            .Include(item => item.Showtime)
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

        return booking is null ? NotFound() : Ok(booking);
    }

    [HttpPost]
    public async Task<ActionResult<Booking>> CreateBooking(
        CreateBookingRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.UserEmail))
        {
            return BadRequest("UserEmail is required.");
        }

        var seatIds = request.SeatIds?.Distinct().ToList() ?? [];
        if (seatIds.Count == 0)
        {
            return BadRequest("At least one seat is required.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var showtimeExists = await db.Showtimes
            .AnyAsync(showtime => showtime.Id == request.ShowtimeId, cancellationToken);
        if (!showtimeExists)
        {
            return NotFound($"Showtime {request.ShowtimeId} was not found.");
        }

        var seats = await db.Seats
            .Where(seat => seat.ShowtimeId == request.ShowtimeId && seatIds.Contains(seat.Id))
            .ToListAsync(cancellationToken);
        if (seats.Count != seatIds.Count)
        {
            return BadRequest("One or more seats do not belong to the selected showtime.");
        }

        if (seats.Any(seat => seat.Status != SeatStatus.Available))
        {
            return Conflict("One or more selected seats are no longer available.");
        }

        foreach (var seat in seats)
        {
            seat.Status = SeatStatus.Reserved;
        }

        var booking = new Booking
        {
            ShowtimeId = request.ShowtimeId,
            UserEmail = request.UserEmail.Trim(),
            SeatIds = seatIds,
            TotalAmount = seats.Sum(seat => seat.Price),
            CreatedAt = DateTime.UtcNow,
            IsConfirmed = false
        };

        db.Bookings.Add(booking);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return CreatedAtAction(nameof(GetBooking), new { id = booking.Id }, booking);
    }

    [HttpPost("{id:guid}/confirm")]
    public async Task<ActionResult<Booking>> ConfirmBooking(Guid id, CancellationToken cancellationToken)
    {
        var booking = await db.Bookings.FindAsync([id], cancellationToken);
        if (booking is null)
        {
            return NotFound();
        }

        booking.IsConfirmed = true;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(booking);
    }
}

public sealed record CreateBookingRequest(int ShowtimeId, string UserEmail, List<int>? SeatIds);
