using CinemaBookingSystem.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CinemaBookingSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MoviesController(CinemaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult> GetMovies(CancellationToken cancellationToken)
    {
        var movies = await db.Movies
            .AsNoTracking()
            .Include(movie => movie.Showtimes)
            .OrderBy(movie => movie.Title)
            .ToListAsync(cancellationToken);

        return Ok(movies);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult> GetMovie(int id, CancellationToken cancellationToken)
    {
        var movie = await db.Movies
            .AsNoTracking()
            .Include(item => item.Showtimes)
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);

        return movie is null ? NotFound() : Ok(movie);
    }
}
