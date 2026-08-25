import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { CurrentUser } from '../common/auth';
import { AddPlaylistItemDto, CreatePlaylistDto, ReorderPlaylistItemsDto, UpdatePlaylistDto } from './playlists.dto';
import { PlaylistsService } from './playlists.service';

@ApiTags('playback')
@Controller('playback/playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.playlists.list(actor, cursor, limit);
  }

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() input: CreatePlaylistDto) {
    return this.playlists.create(actor, input);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.playlists.get(actor, id);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: UpdatePlaylistDto) {
    return this.playlists.update(actor, id, input);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.playlists.remove(actor, id);
  }

  @Put(':id/items/:mediaId')
  addItem(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Param('mediaId') mediaId: string, @Body() input: AddPlaylistItemDto) {
    return this.playlists.addItem(actor, id, mediaId, input);
  }

  @Delete(':id/items/:itemId')
  removeItem(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.playlists.removeItem(actor, id, itemId);
  }

  @Patch(':id/items/order')
  reorder(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: ReorderPlaylistItemsDto) {
    return this.playlists.reorder(actor, id, input);
  }
}
